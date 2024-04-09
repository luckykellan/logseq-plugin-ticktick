import {BlockEntity} from "@logseq/libs/dist/LSPlugin";
import {TickTask} from "./index";
import moment from "moment-timezone";


export const TODO_PREFIXES = ["LATER", "NOW", "TODO", "DOING", "DONE", "WAITING", "CANCELED"];
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const tickTags = new Map<string, { id: string, name: string, cate: string }>();
export const idToProjectsKeyIndex = new Map<string, string>()
export const todoBlockStatus: { [key: string]: string } = {
    '2': 'DONE',
    '-1': 'CANCELED',
    '0': 'TODO'
};
const priorityMap: Record<string, number> = {
    "high priority": 5,
    "高优先级": 5,
    "medium priority": 3,
    "中优先级": 3,
    "low priority": 1,
    "低优先级": 1
};
const priorityMapping: Record<string, number> = {
    "A": 5,
    "B": 3,
    "C": 1
}

export function setPriorityMapping(settings: string) {
    const priorityMappingSettings = JSON.parse(settings);
    for (const key in priorityMappingSettings) {
        if (Object.hasOwn(priorityMappingSettings, key)) {
            const value = priorityMappingSettings[key]
            priorityMapping[key] = priorityMap[value] || 0; // 如果没有找到对应的映射,设置无优先级
        }
    }
}

function determineBlockPrefix(blockMarker: string | undefined, tickStatus: number) {
    if (tickStatus == 0 && blockMarker) {
        if (blockMarker == 'TODO' || blockMarker == 'LATER' || blockMarker == 'NOW' || blockMarker == 'DOING' || blockMarker == 'WAITING') {
            return blockMarker
        } else return 'TODO'
    } else return todoBlockStatus[tickStatus]
}

export function taskToBlockContent(task: TickTask, block?: BlockEntity) {
    const status = determineBlockPrefix(block?.marker, task.status)
    const text = task.title
    let tags = ' '
    if (task.projectId != tickTags.get('inbox_logseq')!.id) {
        tags += '#' + idToProjectsKeyIndex.get(task.projectId)! + " "
    }

    if (block) {
        const tagRegex = /#[^\s]+/g;
        const allTags = block.content.match(tagRegex) || [];
        const tagsToRemove = Array.from(tickTags.keys())
        // 过滤掉需要移除的标签
        const filteredTags = allTags.filter(tag => {
            // 移除#号以比较
            const tagWithoutHash = tag.slice(1);
            // 如果tagsToRemove包含当前标签，则过滤掉
            return !tagsToRemove.includes(tagWithoutHash);
        });
        // 将剩余的标签重新组合成字符串
        tags += filteredTags.join(' ');
        if (task.tags)
            tags += task.tags.map(tag => ` #${tag}`).join(' ')
    }


    let scheduled = '', deadline = '', repeater, logbook
    const formatDateTime = (date:string, timeZone:string) => {
        const format = moment(date).tz(timeZone).format("HH:mm") === "00:00" ? "YYYY-MM-DD ddd" : "YYYY-MM-DD ddd HH:mm";
        return moment(date).tz(timeZone).format(format);
    };
    if (task.startDate) {
        scheduled = `\nSCHEDULED: <${formatDateTime(task.startDate,task.timeZone)}>`
        if (task.dueDate && task.dueDate != task.startDate) {
            deadline = `\nDEADLINE: <${formatDateTime(task.dueDate,task.timeZone)}>`
        }
    }
    if (task.repeatFlag && isSupportedRRULE(task.repeatFlag)) {
        repeater = rruleToSimpleFormat(task.repeatFlag)
        scheduled = `\nSCHEDULED: <${formatDateTime(task.startDate,task.timeZone)} .+${repeater}>`
    }

    const logbookPattern = /\n:LOGBOOK:([\s\S]*?):END:/;
    const tickTimePattern = /TICKID:(.*?)\nTIME:(.*?)(\n|)PROJECTID:(.*?)(\n|$)/;
    const logbookContent = `TICKID:${task.id}\nTIME:${task.modifiedTime}\nPROJECTID:${task.projectId}`
    if (block) {
        const logbookMatch = block.content.match(logbookPattern)
        if (logbookMatch) logbook = logbookMatch[0].replace(tickTimePattern, logbookContent)
        else logbook = `\n:LOGBOOK:\n${logbookContent}\n:END:`;
    } else logbook = `\n:LOGBOOK:\n${logbookContent}\n:END:`;
    return `${status} ${text}${tags}${scheduled}${deadline}${logbook}`
}

export async function blockToTask(block: BlockEntity, parentId?: string, projectId?: string, task: TickTask = {} as TickTask) {
    if (!task.id) task.id = generateTickId()
    task.parentId = parentId
    task.content = ''
    task.desc = ''
    task.items = []
    if (block.children) {
        block.children.forEach((child: any) => {
            if (!isContentTodoPrefixed(child.content))
                extractSubBlockType(child.content) == 'ITEM' ? task.items.push(child.content) : task.content += child.content + '\n'
        })
        if (task.items.length > 0) {
            task.desc = task.content
            task.content = ''
        }
    }
    const blockContent = block.content
    task.title = extractContent(blockContent)
    task.modifiedTime = moment().tz(timeZone)
        .utc()
        .format('YYYY-MM-DDTHH:mm:ss.000+0000');
    task.createdTime = task.createdTime || task.modifiedTime

    const tags = extractTags(blockContent)
    task.tags = []
    tags.forEach((tag: string) => {
        const tickTag = tickTags.get(tag)
        if (tickTag) {
            if (tickTag.cate === 'project') {
                // 只有在commitProjectId为空时才更新,保留第一个清单id
                task.projectId = tickTag.id;
            } else if (tickTag.cate === 'tag') {
                task.tags.push(tickTag.name);
            }
        } else {
            const priority = priorityMapping[tag] || 0;
            if (priority > 0) {
                task.priority = priority;
            }
        }
    })
    if (parentId) {
        // 子任务清单需与父任务清单相同
        task.projectId = projectId!
        task.parentId = parentId
    }

    task.projectId = task.projectId || tickTags.get('inbox_logseq')!.id
    task.status = determineTickTaskStatus(block.marker)
    task.timeZone = timeZone


    const startData = extractDurationAndRepeater(blockContent, "scheduled")
    if (!task.repeatFlag || isSupportedRRULE(task.repeatFlag)) {
        task.repeatFlag = startData.repeater;
        task.repeatFrom = startData.repeater === undefined ? undefined : (startData.repeater.includes('YEARLY') ? '2' : '0');
    }
    task.startDate = startData.time || moment.tz(task.timeZone).startOf('day').utc().format('YYYY-MM-DDTHH:mm:ss.000+0000');
    if (!startData.isAllDay && !task.reminder) {
        task.reminders = [{
            id: generateTickId(),
            trigger: 'TRIGGER:PT0S'
        }]
    } else if (startData.isAllDay) {
        task.reminders = []
    }

    const endData = extractDurationAndRepeater(blockContent, "deadline")
    task.dueDate = endData.time
    task.isAllDay = startData.isAllDay && endData.isAllDay


    if (task.dueDate) task.isAllDay = false
    return task
}

function generateTickId() {
    let flag = Math.floor(Math.random() * 1000);
    const machineIdentifier = Math.floor(Math.random() * 16777215).toString(16);
    const processIdentifier = Math.floor(Math.random() * 65535).toString(16);
    const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
    const counter = (flag = flag % 16777216).toString(16).padStart(6, '0');
    return timestamp + machineIdentifier.padStart(6, '0') + processIdentifier.padStart(4, '0') + counter;
}

export function isContentTodoPrefixed(content: string) {
    if (!content) return false
    return TODO_PREFIXES.some(prefix => content.startsWith(prefix));
}

function extractSubBlockType(text: string) {
    const pattern = /TYPE:(\S+)/s;
    const match = text.match(pattern);
    return match ? match[1] : null;
}

// 过滤掉todo block的状态前缀，如TODO、LATER、NOW、DONE
export function extractContent(text: string) {
    const cleanedText = text
        .replace(/^[A-Z]+\s+/m, "") // 去除状态前缀
        .replace(/#[^\s]+/g, "") // 去除#标签
        .replace(/(DEADLINE:|SCHEDULED:).+?>/g, "") // 去除DEADLINE:和SCHEDULED:及其后的日期时间
        .replace(/\n:LOGBOOK:([\s\S]*?):END:/g, "")
        .trim();
    return cleanedText || "";
}

export function extractTags(text: string) {
    const matches = text.match(/#(\S+)/g);
    if (!matches) {
        return [];
    }
    return matches.map(tag => tag.substring(1).replace(/[\\[\\]]/g, '')); // 移除每个匹配项的#
}

function determineTickTaskStatus(blockMarker: string | undefined) {
    if (blockMarker) {
        if (blockMarker == 'TODO' || blockMarker == 'LATER' || blockMarker == 'NOW' || blockMarker == 'DOING' || blockMarker == 'WAITING') {
            return 0
        } else if (blockMarker == 'DONE') {
            return 2
        } else if (blockMarker == 'CANCELED') {
            return -1
        }
    }
    return 0
}

function extractDurationAndRepeater(text: string, type: 'scheduled' | 'deadline') {
    const pattern = new RegExp(`${type.toUpperCase()}: <([\\d-]+\\s\\w{3}(?:\\s[\\d:]+)?)\\s*(\\.\\+.*?)?>`);
    const match = text.match(pattern);
    if (!match) {
        // 直接在函数顶部处理未匹配情况，减少嵌套
        return {time: null, repeater: undefined, isAllDay: true};
    }

    const dateTime = match[1]; // 日期和（可选的）时间部分
    const repeater = match[2] ? match[2].substring(1) : ''; // 去掉开头的点，处理重复器部分
    const isAllDay = !dateTime.includes(':');// 如果没有指定时间，则认为是全天事件

    // 尝试解析日期和时间，如果没有时间，默认时间为00:00
    const time = moment.tz(dateTime, 'YYYY-MM-DD ddd HH:mm', timeZone)
        .utc()
        .format('YYYY-MM-DDTHH:mm:ss.000+0000');

    if (!repeater) {
        // 如果没有重复器，直接返回
        return {time, repeater: undefined, isAllDay};
    }

    const repeaterMatch = repeater.match(/\+(\d+)([dwmy])/);
    if (!repeaterMatch) {
        console.log('Invalid repeater format:', repeater);
        return {time, repeater: '', isAllDay};
    }
    const [_, interval, unit] = repeaterMatch;
    let rrule = 'RRULE:';
    switch (unit) {
        case 'd':
            rrule += `FREQ=DAILY;INTERVAL=${interval}`;
            break;
        case 'w':
            rrule += `FREQ=WEEKLY;INTERVAL=${interval}`;
            break;
        case 'm': {
            const dayOfMonth = moment(dateTime, "YYYY-MM-DD HH:mm").date();
            rrule += `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${dayOfMonth}`;
            break;
        }
        case 'y':
            rrule += `FREQ=YEARLY;INTERVAL=${interval}`;
            break;
        default:
            rrule = ''; // 不支持的单位，返回 null
    }
    if (!rrule) {
        console.log('Unsupported repeater unit:', unit);
        return {time, repeater: undefined, isAllDay};
    }

    return {time, repeater: rrule, isAllDay};
}

const supportedRRULEs = [
    /^RRULE:FREQ=DAILY;INTERVAL=1$/,
    /^RRULE:FREQ=WEEKLY;INTERVAL=1$/,
    /^RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=25$/,
    /^RRULE:FREQ=YEARLY;INTERVAL=1$/,
    /^RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=SU$/
];

function isSupportedRRULE(rrule: string): boolean {
    return supportedRRULEs.some(regex => regex.test(rrule));
}

function rruleToSimpleFormat(rrule: string): string {
    // 解析 INTERVAL 和 FREQ 部分
    const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
    const freqMatch = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);

    if (!intervalMatch || !freqMatch) {
        return 'Invalid RRULE'; // 不匹配任何已知的重复规则
    }

    const interval = intervalMatch[1]; // 获取间隔数值
    const freq = freqMatch[1]; // 获取频率

    // 将频率转换为简写形式
    let freqAbbreviation;
    switch (freq) {
        case 'DAILY':
            freqAbbreviation = 'd';
            break;
        case 'WEEKLY':
            freqAbbreviation = 'w';
            break;
        case 'MONTHLY':
            freqAbbreviation = 'm';
            break;
        case 'YEARLY':
            freqAbbreviation = 'y';
            break;
        default:
            return 'Invalid frequency'; // 未知的频率
    }

    return `${interval}${freqAbbreviation}`; // 返回转换后的简写形式
}
