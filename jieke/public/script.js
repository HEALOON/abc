const socket = io();
let formElm = document.querySelector("#chatForm");
console.log(formElm);
let msgInput = document.querySelector("#newMessage");
console.log(msgInput);
// LISTEN FOR NEWLY TYPES MESSAGES, 
// SEND THEM TO THE SERVER


// LISTEN FOR NEW MESSAGES FROM SERVER
formElm.addEventListener("submit", newMessageSubmitted);//which we are listening, which funciton should be called when the event happens
function newMessageSubmitted(event){
    console.log(event);
    //stop form element from refreshing the page
    event.preventDefault();

    let newMessage = msgInput.value;
    console.log(newMessage);
    appendMessage(newMessage);//just for fun
    //actually we need to sen the new message to the server first
    socket.emit("message", newMessage);
    //clear out input
    msgInput.value = "";

}
// APPEND THEM TO THE MESSAGE BOX
// AUTO SCROLL TO BOTTOM

// APPEND MESSAGES TO BOX
function appendMessage(txt){
    console.log(txt);
    //select liat first
    let chatThreadList = document.querySelector("#threadWrapper ul");
    console.log(chatThreadList);
    //create list (ul) first
    let newListItem = document.querySelector("li");
    newListItem.innerText = txt;
    //append new li to the list
    chatThreadList.append(newListItem);
    //scroll to buttom of page
    chatThreadList.scrollTop = chatThreadList.scrollHeight;
}
appendMessage('lallalalalla');

// OPTIONAL: LISTEN FOR NEW NAME
// SEND IT TO SERVER
