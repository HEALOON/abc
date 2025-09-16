// from: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
function requestOrientation() {
    const btn = document.querySelector('#requestOrientationButton'); //隐藏按钮
    if (btn) btn.style.display = "none";
    // feature detect
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            console.log("permissionState", permissionState)
            if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
            }
        })
        .catch(console.error);
    } else {
    }
}
