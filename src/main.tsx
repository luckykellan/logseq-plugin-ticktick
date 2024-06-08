import "@logseq/libs";
import "./index.css";
import moment from "moment-timezone";
import {
    commitTask,
    getAllProjects, getTask, setHostIp, setTickToken
} from "./tick_api";
import {BlockEntity,} from "@logseq/libs/dist/LSPlugin";
import {
    isContentTodoPrefixed,
    tickTags,
    blockToTask,
    taskToBlockContent,
    idToProjectsKeyIndex,
    TODO_PREFIXES,
    todoBlockStatus, setPriorityMapping, convertAndFormatDate
} from "./types/utils"
import {createTickRequest, TickRequest, TickTask, TickTaskDeletion} from "./types";
import {cn_schema, en_schema} from "./settings";

const upsertBlockIdSet = new Set<number>();
const deleteBlockMap = new Map<number, TickTaskDeletion>
let preferredDateFormat: string
let isConfigChinese: boolean;
const rootTodosMap = new Map<string, BlockEntity>();
const allTodosMap = new Map<number, string>();
let isSyncing = false
let isDealBlock = false

function main() {
    initSettings().then(() => {
        console.log('initSettings')
        if (logseq.settings?.accessToken && logseq.settings?.taskManagerProvider) {
            preSync()
        } else {
            if (isConfigChinese) logseq.UI.showMsg('设置accessToken和taskManagerProvider后，ticktick才可正常同步', 'warning')
            else logseq.UI.showMsg('Please set accessToken and taskManagerProvider for TickTick sync.', 'warning')
        }
    })
    logseq.onSettingsChanged((newSettings, oldSettings) => {
        console.log('onSettingsChanged')
        //if (newSettings.syncKeybinding != oldSettings.syncKeybinding) {
        if (newSettings.syncKeybinding) {
            // @ts-ignore
            logseq.App.unregister_plugin_simple_command(`${logseq.baseInfo.id}`)
            logseq.App.registerCommandPalette({
                key: 'tick_sync_command',
                label: 'Sync From Tick',
                keybinding: {mode: 'global', binding: newSettings.syncKeybinding.toLowerCase()}
            }, preSync)
        }

        if (!newSettings.accessToken || !newSettings.taskManagerProvider) {
            if (isConfigChinese) logseq.UI.showMsg('设置accessToken和taskManagerProvider后，ticktick才可正常同步', 'warning')
            else logseq.UI.showMsg('Please set accessToken and taskManagerProvider for TickTick sync.', 'warning')
        } else {
            setTickToken(newSettings.accessToken)
            setHostIp(newSettings.taskManagerProvider)
            setPriorityMapping(newSettings.priorityMapping)
        }
    })


    logseq.DB.onChanged(async (e) => {
        if (isSyncing || isDealBlock) return
        // 已知Bug,当输入TODO立刻回车，会不触发saveBlock直接到insertBlocks，导致没有执行blockIdArray.push，导致无法commitTask
        if (e.txMeta?.outlinerOp) { // deleteBlocks||insertBlocks||saveBlock
            const block = e.blocks[0]
            if (block) {
                console.log(e.txMeta?.outlinerOp, block)
                const outlinerOp = e.txMeta?.outlinerOp
                if (outlinerOp == 'insert-blocks') {
                    // 兜底操作，避免如果输入不间断，并在输入完后立即回车，会无法触发save-block直接到insert-blocks，导致没有执行upsertBlockIdSet.add进而无法同步到ticktick
                    if (isContentTodoPrefixed(block.content)) upsertBlockIdSet.add(block.id)
                    if (upsertBlockIdSet.size > 0) {
                        for (const number of upsertBlockIdSet) {
                            await dealBlock(number)
                        }
                        upsertBlockIdSet.clear()
                    }
                    if (deleteBlockMap.size > 0) {
                        const tickRequest = createTickRequest({delete: [...deleteBlockMap.values()]})
                        await commitTask(tickRequest)
                        deleteBlockMap.clear()
                    }
                } else {
                    const parentTickId = allTodosMap.get(block.parent.id)
                    if (isContentTodoPrefixed(block.content)) {
                        if (outlinerOp == 'save-block') {
                            upsertBlockIdSet.add(block.id)
                            deleteBlockMap.delete(block.id)
                        } else if (outlinerOp == 'delete-blocks') {
                            upsertBlockIdSet.delete(block.id)
                            if (block.content.includes('TICKID'))
                                deleteBlockMap.set(block.id, {
                                    taskId: extractTickId(block.content)!,
                                    projectId: extractProjectId(block.content)
                                })
                        }
                    } else if (!isInputMatchingTodoPrefix(block.content) && parentTickId) {
                        upsertBlockIdSet.add(block.parent.id)
                    }
                }
            }
        }
    })
}

function isInputMatchingTodoPrefix(input: string) {
    // 检查输入是否匹配TODO类关键字前缀之一
    for (const prefix of TODO_PREFIXES) {
        if (prefix.startsWith(input) || input.startsWith(prefix)) {
            // 找到匹配，可能是TODO类输入
            return true;
        }
    }
    // 没有匹配，不是TODO类输入
    return false;
}

async function dealBlock(blockId: number) {
    const block = await logseq.Editor.getBlock(blockId, {includeChildren: true})
    if (!block) return
    const parentTickId = allTodosMap.get(block.parent.id)
    let projectId = ''
    if (parentTickId) {
        const parentBlock = (await logseq.Editor.getBlock(blockId))!
        projectId = extractProjectId(parentBlock.content)
    }
    let task
    if (block.content.includes('TICKID')) {
        const tickTask = await getTask(extractTickId(block.content)!)
        task = await blockToTask(block, parentTickId, projectId, tickTask)
        const tickRequest: TickRequest = createTickRequest({update: [task]})
        commitTask(tickRequest)
    } else {
        task = await blockToTask(block, parentTickId, projectId)
        const tickRequest: TickRequest = createTickRequest({add: [task]})
        commitTask(tickRequest)
        allTodosMap.set(block.id, task.id)
    }
    isDealBlock = true
    await logseq.Editor.updateBlock(block.uuid, upsertBlockLogbook(block.content, task.id, task.modifiedTime, task.projectId)).then(() => {
        setTimeout(() => isDealBlock = false, 300)
    })

}

function extractTickId(text: string) {
    const pattern = /TICKID:(\S+)/s;
    const match = text.match(pattern);
    return match ? match[1] : null;
}

function extractModifiedTimeTime(text: string) {
    const pattern = /TIME:(\S+)/s;
    const match = text.match(pattern);
    return match ? match[1] : null;
}

function extractProjectId(text: string) {
    const pattern = /PROJECTID:(\S+)/s;
    const match = text.match(pattern);
    return match ? match[1] : '';
}

function upsertBlockLogbook(text: string, id: string, time: string, projectId: string) {
    const logbookPattern = /\n:LOGBOOK:([\s\S]*?):END:/;
    const tickTimePattern = /TICKID:(.*?)\nTIME:(.*?)(\n|)PROJECTID:(.*?)(\n|$)/;

    if (logbookPattern.test(text)) {
        return text.replace(logbookPattern, (match, logbookContent) => {
            // 检查是否已包含TICKID、TIME和PROJECTID
            if (tickTimePattern.test(logbookContent)) {
                // 如果已包含，则替换
                return match.replace(tickTimePattern, `TICKID:${id}\nTIME:${time}\nPROJECTID:${projectId}$5`);
            } else {
                // 如果不包含，则添加
                return `\n:LOGBOOK:\nTICKID:${id}\nTIME:${time}\nPROJECTID:${projectId}\n:END:`;
            }
        });
    } else {
        // 如果整个文本中不包含LOGBOOK区块，直接在末尾添加
        return `${text}\n:LOGBOOK:\nTICKID:${id}\nTIME:${time}\nPROJECTID:${projectId}\n:END:`;
    }
}

async function initSettings() {
    const configs = await logseq.App.getUserConfigs();
    // 将格式字符串中的 'do' 替换为 'Do' 以适配 Moment.js 的格式
    preferredDateFormat = configs.preferredDateFormat.replace('do', 'Do');
    isConfigChinese = configs.preferredLanguage == 'zh-CN'
    if (isConfigChinese) logseq.useSettingsSchema(cn_schema)
    else logseq.useSettingsSchema(en_schema)
}

function initTags(data: any) {
    data['tags'].forEach((item: any) => {
        tickTags.set(item.name, {
            id: item.etag,
            name: item.name,
            cate: 'tag'
        })
    })

    data['projectProfiles']?.forEach((item: any) => {
        tickTags.set(item.name, {
            id: item.id,
            name: item.name,
            cate: 'project'
        })
        idToProjectsKeyIndex.set(item.id, item.name)
    })
    tickTags.set('inbox_logseq', {
        id: data['inboxId'],
        name: 'inbox',
        cate: 'inbox'
    })
}

async function getLocalTODO() {
    const todoList = await logseq.DB.datascriptQuery(`[:find (pull ?b [*])
         :where
         [?b :block/marker ?m]
         [(contains? #{"TODO" "LATER" "NOW" "DONE" "DOING" "WAITING" "CANCELED"} ?m)]]`)
    for (const item of todoList) {
        if (item[0].content && item[0].content.includes("TICKID")) {
            const tickId = extractTickId(item[0].content)
            allTodosMap.set(item[0].id, tickId!)
            if (item[0].parent.id == item[0].page.id) rootTodosMap.set(tickId!, item[0])
            else {
                const parentBlock = await logseq.Editor.getBlock(item[0].parent.id)
                if (!isContentTodoPrefixed(parentBlock?.content)) rootTodosMap.set(tickId!, item[0])
            }
        }
    }
    return rootTodosMap;
}

async function appendBlock(parentUuid: string, tickTask: any, page: boolean) {
    let block: BlockEntity;
    // if (page) block = (await logseq.Editor.appendBlockInPage(parentUuid, `${todoBlockStatus[tickTask.status]} ${upsertBlockLogbook(tickTask.title, tickTask.id, tickTask.modifiedTime, tickTask.projectId)}`))!
    // else block = (await logseq.Editor.insertBlock(parentUuid, `${todoBlockStatus[tickTask.status]} ${upsertBlockLogbook(tickTask.title, tickTask.id, tickTask.modifiedTime, tickTask.projectId)}`, {sibling: false}))!
    if (page) block = (await logseq.Editor.appendBlockInPage(parentUuid, taskToBlockContent(tickTask)))!
    else block = (await logseq.Editor.insertBlock(parentUuid, taskToBlockContent(tickTask), {sibling: false}))!

    await insertContentToBlock(tickTask, block);
    return block
}

async function insertContentToBlock(tickTask: any, block: any) {
    block.children?.forEach((child: any) => {
        if (!child.marker) logseq.Editor.removeBlock(child.uuid);
    });

    const contents = [
        ...(tickTask.content ? tickTask.content.split('\n') : []),
        ...(tickTask.desc ? tickTask.desc.split('\n') : []),
        ...tickTask.items.map((item: any) => item.title + '\n:LOGBOOK:' + '\nTYPE:ITEM' + ' \n:END:')
    ].filter(item => item.trim() !== '')

    await Promise.all(contents.map((content: any) => {
        logseq.Editor.insertBlock(block.uuid, content, {sibling: false})
    }))
    // 使用insertBatchBlock会导致随机的上层block content中的Logbook被删除,原因未知,猜测可能和uuid有关
    //if (contents.length) await logseq.Editor.insertBatchBlock(block.uuid, contents, {sibling: false,keepUUID:true})
}

async function syncTickTaskStatus([tickId, todoBlock]: [string, BlockEntity]) {
    await getTask(tickId).then(async task => {
        if (task.deleted == 1) {
            await logseq.Editor.removeBlock(todoBlock.uuid)
        } else {
            await logseq.Editor.updateBlock(todoBlock.uuid, `${todoBlockStatus[task.status]} ${upsertBlockLogbook(task.title, task.id, task.modifiedTime, task.projectId)}`)
        }
    }).catch(e => {
        if (e.message == 'Task not found error') {
            logseq.Editor.removeBlock(todoBlock.uuid)
        }
    })
}

async function syncTasks(tickTaskList: TickTask[]) {
    await Promise.all(
        tickTaskList
            .filter((tickTask: TickTask) => !tickTask.parentId && tickTask.kind != 'NOTE')
            .map((tickTask: TickTask) => upsertTaskAndChildrenConcurrently(tickTask))
    ).then(async () => {
        await Promise.all(Array.from(rootTodosMap, syncTickTaskStatus))
    }).catch(error => {
        console.error('处理任务时发生错误:', error);
    });
}

async function preSync() {
    console.log('同步开始---------------')
    let toast: string, toast_success: string;
    if (isConfigChinese) {
        toast = '正在同步滴答清单，请稍等...'
        toast_success = '同步成功'
    } else {
        toast = 'Syncing TickTick, please wait...'
        toast_success = 'Sync success'
    }
    isSyncing = true
    await logseq.UI.showMsg(toast, 'warning', {
        key: 'sync-ticktick',
        timeout: 10000
    })

    await Promise.all([getAllProjects(), getLocalTODO()])
        .then(async ([projects, _]: [any, any]) => {
            console.log('初始数据：')
            console.log('tickTasks: ', projects['syncTaskBean']['update'])
            console.log('rootTodosMap: ', rootTodosMap)
            initTags(projects)
            syncTasks(projects['syncTaskBean']['update']).then(() => {
                console.log('同步结束---------------')
                setTimeout(() => isSyncing = false, 300)
                logseq.UI.closeMsg('sync-ticktick')
                logseq.UI.showMsg(toast_success, 'success')
            })
        })
}

async function upsertTaskAndChildrenConcurrently(tickTask: TickTask, siblingBlocks?: Map<string, BlockEntity>, parentTodoBlockUuid?: string) {
    let block = siblingBlocks?.get(tickTask.id) ?? rootTodosMap.get(tickTask.id)
    if (block) {
        const time = extractModifiedTimeTime(block.content)
        if (time != tickTask.modifiedTime) {
            await Promise.all([
                // logseq.Editor.updateBlock(block.uuid, `${determineBlockPrefix(block, tickTask.status)} ${upsertBlockLogbook(tickTask.title, tickTask.id, tickTask.modifiedTime, tickTask.projectId)}`),
                logseq.Editor.updateBlock(block.uuid, taskToBlockContent(tickTask, block)),
                insertContentToBlock(tickTask, block)
            ])
        }
        if (!siblingBlocks) rootTodosMap.delete(tickTask.id)
    } else {
        if (siblingBlocks) {
            block = await appendBlock(parentTodoBlockUuid!, tickTask, false)
        } else {
            const formattedTime = convertAndFormatDate(tickTask.createdTime, preferredDateFormat)
            const page = await logseq.Editor.getPage(formattedTime) || (await logseq.Editor.createPage(formattedTime, '', {
                redirect: false,
                journal: true
            }))!;
            block = await appendBlock(page.uuid, tickTask, !siblingBlocks);
        }

    }
    if (tickTask.childIds) {
        const includeChildrenBlock = (await logseq.Editor.getBlock(block.uuid, {includeChildren: true}))!
        const siblingBlocks = new Map<string, BlockEntity>();
        includeChildrenBlock.children?.forEach((child: any) => {
            if (child.marker) {
                const childTickId = extractTickId(child.content)!
                siblingBlocks.set(childTickId, child);
            }
        });
        await Promise.all(tickTask.childIds.map(async (childTaskId: string) => {
            const childTask = await getTask(childTaskId)
            await upsertTaskAndChildrenConcurrently(childTask, siblingBlocks, block!.uuid)
        }));
    }
}

logseq.ready(main).catch(console.error);