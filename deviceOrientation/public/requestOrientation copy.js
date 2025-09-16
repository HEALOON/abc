// from: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
function requestOrientation() {
    console.log("ff")
    // feature detect
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        console.log("hall???")
        DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            console.log("permissionState", permissionState)
            if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
            }
        })
        .catch(console.error);
    } else {
        // handle regular non iOS 13+ devices
        console.log("else???")
    }
}
