import {SettingSchemaDesc} from "@logseq/libs/dist/LSPlugin";

export const en_schema: Array<SettingSchemaDesc> = [
    {
        "key": "accessToken",
        "type": "string",
        "default": null,
        "title": "",
        "description": "Log in to the Dida web version, open the developer tools and select the Network tab. After refreshing the page, randomly choose a request and copy the value of the 't' field in the Cookie from the request headers, up to the semicolon."
    },
    {
        "key": "taskManagerProvider",
        "type": "enum",
        "default": null,
        "enumChoices": ["TickTick", "Dida"],
        "enumPicker":'radio',
        "title": "",
        "description": "Select the task management tool you wish to integrate"
    },
    {
        "key": "priorityMapping",
        "type": "string",
        "default": '{"A": "High Priority", "B": "Medium Priority", "C": "Low Priority"}',
        "title": "Priority Mapping",
        "description": "Please enter your custom priority mapping in JSON format. If there are no special requirements, you can keep the default."
    },
    {
        "key": "syncKeybinding",
        "type": "string",
        "default": null,
        "title": "Sync Shortcut",
        "description": "Manually sync from TickTick or Dida to Logseq. Even without setting a shortcut, syncing will occur at every start."
    }
]


export const cn_schema: Array<SettingSchemaDesc> = [
    {
        key: "accessToken",
        type: "string",
        default: null,
        title: "",
        description: "登录滴答清单网页版，打开开发者工具并选择网络标签(Network)，刷新页面后随机选一个请求，复制请求头中Cookie的t字段值，直至分号。",
    },
    {
        key: "taskManagerProvider",
        type: "enum",
        default: null,
        enumChoices: ["TickTick", "滴答清单"],
        title: "",
        description: "选择您希望集成的任务管理工具",
        enumPicker: "radio",
    },
    {
        key: "priorityMapping",
        type: "string", // 使用字符串类型
        default: '{"A": "高优先级", "B": "中优先级", "C": "低优先级"}',
        title: "优先级映射关系",
        description: "请输入自定义的优先级映射关系（JSON格式），如无特殊需求，保持默认就可",
    }, {
        key: "syncKeybinding",
        type: "string",
        default: null,
        description: "主动从ticktick或滴答清单中同步到logseq，即使不设置快捷键，也会在每次启动时同步",
        title: "同步快捷键"
    }
];