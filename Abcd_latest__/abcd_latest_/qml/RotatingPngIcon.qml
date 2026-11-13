import QtQuick 2.12

Item {
    id: root

    property bool active: false
    property string imageSource: ""
    property int iconSize: 70
    property bool reverse: false

    width: iconSize
    height: iconSize

    Image {
        id: wheelImage
        anchors.centerIn: parent
        width: root.iconSize
        height: root.iconSize
        source: root.imageSource
        fillMode: Image.PreserveAspectFit
        smooth: true
        cache: false
        asynchronous: true

        transform: Rotation {
            id: wheelRotation
            origin.x: wheelImage.width / 2
            origin.y: wheelImage.height / 2
            angle: 0
        }

        NumberAnimation {
            target: wheelRotation
            property: "angle"
            from: root.reverse ? 360 : 0
            to: root.reverse ? 0 : 360
            duration: 450
            loops: Animation.Infinite
            running: root.active
        }
    }

    onActiveChanged: {
        if (!active) {
            wheelRotation.angle = 0
        }
    }
}
