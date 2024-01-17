import axios from 'axios'
import CryptoJS from 'crypto-js'
import moment from 'moment-timezone'
const token ='43A001113F9610FF58423B8C4EEB0D8F46A9032593D6C412A53C85EEADA8ED5650443E505E08B3C43A8982FF945E153FB1A21A28BB4D5FC9C14852F2DCD7A408846365C7584CBA095CD553F317B518409759DD307643058DEC748F9C13ECC3F7D8A585CE3128244F0B3A739FC7AE5422151002FFD8A51141C13841838C88E3792FCF76759E348A1488D275ADC2D7811D4CA22BE13F424FC2A51FEDDF8DB6FA89EAD6ED9E984075685307877D773E7553ED48EB889B07BD4E'

export async function commitTask(ifInsert:boolean,id:string,title:string,time:string,state:number){
    const data= {
        "items": [],
        "reminders": [],
        "exDate": [],
        "dueDate": null,
        "priority": 0,
        "isAllDay": true,
        "repeatFlag": null,
        "progress": 0,
        "assignee": null,
        "sortOrder": -32721551228928,
        "startDate": time,
        "isFloating": false,
        "status": state,
        "projectId": "inbox1020694981",
        "kind": null,
        "createdTime": '',
        "modifiedTime": time,
        "title": title,
        "tags": [],
        "timeZone": "Asia/Shanghai",
        "content": "",
        "id": id
    }
    if(ifInsert) data.createdTime = time

    await axios.request({
        url:'https://api.dida365.com/api/v2/batch/task',
        method:'post',
        headers:{
            'User-Agent': 'TickTick/M-5010',
            'Content-Type': 'application/json',
            'Authorization': `OAuth ${token}`
        },
        data:JSON.stringify({
            "add": [
               ifInsert?data:null
            ],
            "update": [
                ifInsert?null:data
            ],
            "delete": [],
            "addAttachments": [],
            "updateAttachments": [],
            "deleteAttachments": []
        })
    })
}
export async function getAllProjetc(){
    return await axios.request({
        url:'https://api.dida365.com/api/v2/batch/check/0',
        method:'get',
        headers:{
            'User-Agent': 'TickTick/M-5010',
            'Content-Type': 'application/json',
            'Authorization': `OAuth ${token}`
        },
    })
}

export function generateTickId(){
    return CryptoJS.MD5(Date.now().toString()).toString()
}


