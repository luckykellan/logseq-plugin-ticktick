import "@logseq/libs";

import React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { logseq as PL } from "../package.json";
import {commitTask, generateTickId, getAllProjetc} from "../../logseq-plugin-ticktick/src/tick_api";
import moment from "moment-timezone";

// @ts-expect-error
const css = (t, ...args) => String.raw(t, ...args);

const pluginId = PL.id;
let blockIdArray:number[] = []

function main() {
  console.info(`#${pluginId}: MAIN`);
  const root = ReactDOM.createRoot(document.getElementById("app")!);

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  function createModel() {
    return {
      show() {
        logseq.showMainUI();
      },
    };
  }

  logseq.provideModel(createModel());
  logseq.setMainUIInlineStyle({
    zIndex: 11,
  });

  const openIconName = "template-plugin-open";

  logseq.provideStyle(css`
    .${openIconName} {
      opacity: 0.55;
      font-size: 20px;
      margin-top: 4px;
    }

    .${openIconName}:hover {
      opacity: 0.9;
    }
  `);

  logseq.App.registerUIItem("toolbar", {
    key: openIconName,
    template: `
      <div data-on-click="show" class="${openIconName}">⚙️</div>
    `,
  });


  getAllProjetc().then((res)=>{
    console.log('all project: ',res)
    const projects = JSON.parse(res.data)
    logseq.FileStorage.hasItem("project").then((haProject)=>{
      if(!haProject){
        logseq.FileStorage.setItem("project",projects['projectProfiles'].map((item:any)=>{
          return {
            id:item.id,
            name:item.name,
          }
        }))
      }
    })
  })

  logseq.DB.onChanged(async (e) => {
    const keys = await logseq.FileStorage.allKeys()
    const values = await logseq.FileStorage.getItem('778e612040344123827f3c219c30a937')
    console.log('logseq file storage: ',keys)
    console.log('logseq file values: ',values)
    // 已知Bug,当输入TODO立刻回车，会不触发saveBlock直接到insertBlocks，导致没有执行blockIdArray.push，导致无法commitTask
    if (e.txMeta?.outlinerOp) { // deleteBlocks||insertBlocks||saveBlock
      const block = e.blocks[0]
      if (block) {
        console.log(e.txMeta?.outlinerOp+":  ",block)
        if (e.txMeta?.outlinerOp == 'insertBlocks') {
          console.log("blockIdArray length: ",blockIdArray.length)
          if (blockIdArray.length > 0) {
            for (const number of blockIdArray)
              await dealBlock(number)
            blockIdArray = []
          }
        } else {
          if (!blockIdArray.includes(block.id) && ifBlockIsTodo(block.content)){
            console.log("blockIdArray push")
            blockIdArray.push(block.id)
          }

        }
      }
    }
  })

}

async function dealBlock(blockId:number){
  const block =await logseq.Editor.getBlock(blockId)
  if(block==null) return
  const blockContent = block.content
  const tickTitle = extractContent(blockContent)
  if (tickTitle == null) return
  const time = moment.utc().format('YYYY-MM-DDTHH:mm:ss.SSS+0000');
  const state = blockContent.startsWith("DONE")?2:0
  if(blockContent.includes('TICKID')){
    const tickId = extractTickId(blockContent)
    const content = extractContent(blockContent)
    //commitTask(false,tickId!,content!,time,state)
    console.log('修改')
  }else{
    console.log('增加')
    const id = generateTickId()
    console.log('id: ',id)
    // commitTask(true,id,tickTitle,time,state)
    await Promise.all([
      logseq.Editor.updateBlock(block.uuid,updateBlock(blockContent,id)),
      logseq.FileStorage.setItem(id,JSON.stringify({
        uuid:block.uuid,
        createTime:time,
        updateTime:time,
        title:tickTitle,
      }))
    ])
  }
}

function ifBlockIsTodo(content:string){
  if(!content) return false
  return content.startsWith('TODO') || content.startsWith('LATER') || content.startsWith('NOW') || content.startsWith('DONE');
}

function extractContent(text:string){
  const match = text.match(/^[A-Z]+\s+(.*)/m);
  if (match && match[1]) {
    return match[1].trim();
  } else {
    return null;
  }
}

function extractTickId(text:string) {
  const pattern = /TICKID:(\S+)/s;
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function updateBlock(text:string,id:string){
  const logbookPattern = /\n:LOGBOOK:([\s\S]*?)\n:END:/;
  const additionalContent = `\nTICKID:${id}\nSTATE:0`
  let newContent = ''
  if (logbookPattern.test(text)) {
    // 如果文本中包含模式，则在":END:"之前插入额外内容
    newContent = text.replace(/\n:END:/, additionalContent + '\n:END:');
  } else {
    // 如果文本中不包含模式，则在末尾添加
    newContent = text + '\n:LOGBOOK:' + additionalContent + ' \n:END:';
  }
  return newContent
}


logseq.ready(main).catch(console.error);
