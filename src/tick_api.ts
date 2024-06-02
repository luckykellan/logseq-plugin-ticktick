import axios from 'axios'
import {TickRequest, TickTask} from "./types";

let token = '73AE2E6CC13DD9673C0C259EF3DC2A9162D23E52E53C3E2BC4515BAB9CD7B2FF48487DCBD92AF5455E7F27A14DCBC153E96838F49086468526163D9E01540D151E2AC37DF778FFE45E3C82D563E99191BD370DAB6ED59181EAF59D8097BC4375385AA04082B6E13207380EE6E17F65D7FCDA4FF05F6F0B637CD8480E8B2391262833FB48861CC0569C684CFED5D6608E9FB6687070F93DA5C093C355F178EA86151002FFD8A51141ED48EB889B07BD4E'
let host: string


export function setTickToken(newToken: string) {
    token = newToken
}

export function setHostIp(hostConfig: string) {
    if (hostConfig == 'TickTick') host = 'https://api.ticktick.com'
    else host = 'https://api.dida365.com'
}

export async function commitTask(tickRequest: TickRequest) {
    await axios.request({
        url: `${host}/api/v2/batch/task`,
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `OAuth ${token}`
        },
        data: JSON.stringify(tickRequest)
    });
    tickRequest.add.forEach(task => {
        if (task.parentId) {
            axios.request({
                url: `${host}/api/v2/batch/taskParent`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `OAuth ${token}`
                },
                data: JSON.stringify([{
                    taskId: task.id,
                    parentId: task.parentId,
                    projectId: task.projectId
                }])
            })
        }
    })
}

export async function getAllProjects() {
    const response = await axios.request({
        url: `${host}/api/v2/batch/check/0`,
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `OAuth ${token}`
        },
    })
    return response.data
}

export async function getTask(id: string): Promise<TickTask> {
    try {
        const data = await axios.get(`${host}/api/v2/task/${id}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `OAuth ${token}`,
            }
        });
        return data.data;
    } catch (error: any) {
        if (error.response.data.errorCode === "task_not_found") {
            throw new Error("Task not found error");
        } else {
            throw error;
        }
    }

}




