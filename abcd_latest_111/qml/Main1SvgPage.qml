import QtQuick 2.12

Item {
    id: root
    width: 300
    height: 220

    Image {
        id: mainImage
        anchors.fill: parent
        source: appController.assetsPath + "/main.svg"
        fillMode: Image.PreserveAspectFit
        smooth: true
        cache: false
    }

    Image {
        id: leftWheel
        x: 65
        y: 80
        width: 60
        height: 60
        source: appController.assetsPath + "/left1.svg"
        fillMode: Image.PreserveAspectFit
        smooth: true
        cache: false

        transform: Rotation {
            id: leftRot
            origin.x: leftWheel.width / 2
            origin.y: leftWheel.height / 2
            angle: 0
        }

        NumberAnimation {
            target: leftRot
            property: "angle"
            from: 0
            to: 360
            duration: 500
            loops: Animation.Infinite
            running: true
        }
    }

    Image {
        id: rightWheel
        x: 175
        y: 80
        width: 60
        height: 60
        source: appController.assetsPath + "/right1.svg"
        fillMode: Image.PreserveAspectFit
        smooth: true
        cache: false

        transform: Rotation {
            id: rightRot
            origin.x: rightWheel.width / 2
            origin.y: rightWheel.height / 2
            angle: 0
        }

        NumberAnimation {
            target: rightRot
            property: "angle"
            from: 360
            to: 0
            duration: 500
            loops: Animation.Infinite
            running: true
        }
    }
}