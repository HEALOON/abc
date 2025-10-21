const socket = io();              //initialize socket connection:

let formElm = document.querySelector("#chatForm");
console.log(formElm);
let msgInput = document.querySelector("#newMessage");
console.log(msgInput);
// LISTEN FOR NEWLY TYPES MESSAGES, 
// SEND THEM TO THE SERVER


// LISTEN FOR NEW MESSAGES FROM SERVER
socket.on("newMessage", (data) => {
  // data = { message }
  appendMessage(data.message);
});
//which we are listening, which funciton should be called when the event happens
formElm.addEventListener("submit", newMessageSubmitted);
function newMessageSubmitted(event){
    console.log(event);
    //stop form element from refreshing the page
    event.preventDefault();

    const newMessage = msgInput.value.trim();
    if (!newMessage) return;        // 空消息不发送
    socket.emit("message", newMessage); // ✅ 仅发送给服务器
    msgInput.value = "";            // 清空输入框

}

// APPEND MESSAGES TO BOX
function appendMessage(txt){
  const chatThreadList = document.querySelector("#threadWrapper ul");
  if (!chatThreadList) return;

  // 新建 li
  const li = document.createElement("li");

  // who（先不处理姓名，给个占位或留空）
  const whoSpan = document.createElement("span");
  whoSpan.className = "who";
  whoSpan.textContent = ""; // 例如：可以改成 "• " 作为占位

  // words（真正的消息文本）
  const wordsSpan = document.createElement("span");
  wordsSpan.className = "words";
  wordsSpan.textContent = txt;

  li.appendChild(whoSpan);
  li.appendChild(wordsSpan);
  chatThreadList.appendChild(li);

  // 自动滚动到底部
  chatThreadList.scrollTop = chatThreadList.scrollHeight;
}
// appendMessage('lallalalalla');

// OPTIONAL: LISTEN FOR NEW NAME
// SEND IT TO SERVER
