export interface Reminder {
    id: string;
    trigger: string;
}

export interface TickTask {
    id: string;
    projectId: string;
    parentId: string | undefined;
    sortOrder: number;
    title: string;
    content: string;
    desc: string;
    startDate: string;
    dueDate: string | null;
    modifiedTime: string;
    createdTime: string;
    timeZone: string;
    isFloating: boolean;
    isAllDay: boolean;
    reminder: string;
    reminders: Reminder[];
    repeatFlag: string | undefined;
    repeatFrom: string | undefined;
    exDate: any[];
    priority: number;
    status: number;
    items: any[];
    progress: number;
    etag: string;
    deleted: number;
    creator: number;
    tags: string[];
    childIds: string[];
    kind: string;

}

export interface TickTaskDeletion {
    taskId: string;
    projectId: string;
}

export interface TickRequest {
    "add": TickTask[],
    "update": TickTask[],
    "delete": TickTaskDeletion[],
    // "addAttachments": [],
    // "updateAttachments": []
    // "deleteAttachments": [],
}

export function createTickRequest(request: Partial<TickRequest>): TickRequest {
    // 使用 ?? 操作符指定默认值
    return {
        add: request.add ?? [],
        update: request.update ?? [],
        delete: request.delete ?? [],
        // addAttachments: request.addAttachments ?? [],
        // updateAttachments: request.updateAttachments ?? [],
        // deleteAttachments: request.deleteAttachments ?? [],
    };
}


export interface TodoBlockContent {
    status: "LATER" | "NOW" | "TODO" | "DOING" | "DONE" | "WAITING" | "CANCELED";
    text: string;
    scheduled: string | undefined;
    deadline: string | undefined;
    logbook: string | undefined;
}