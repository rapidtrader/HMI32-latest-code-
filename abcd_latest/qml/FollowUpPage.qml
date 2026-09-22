import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: page
    color: "#091016"

    // ================= OLD FUNCTIONALITY PROPERTIES - SAME =================
    property bool frontUpOn: false
    property bool frontDownOn: false
    property bool rearUpOn: false
    property bool rearDownOn: false
    
    // A25 Sensor distance
    property int a25DistanceMm: 0
    property real a25DistanceCm: a25DistanceMm / 10.0
    
    function refreshA25Data() {
        a25DistanceMm = machineBridge.getA25Distance()
    }

    property bool frontLeftActive: false
    property bool frontRightActive: false
    property bool rearLeftActive: false
    property bool rearRightActive: false

    property bool leftExtractPressed: false
    property bool leftRetractPressed: false
    property bool rightRetractPressed: false
    property bool rightExtractPressed: false

    // Retract/Extract mutual lock: only one can be green/active at a time
    property string leftBrushMoveMode: ""
    property string rightBrushMoveMode: ""

    property int frontDownTimestamp: 0
    property int frontUpTimestamp: 0
    property int frontUpRemainingSec: 0
    property int frontDownRemainingSec: 0
    property int frontTimerTick: 0
    property bool frontDownReady: false
    property bool frontUpRetractRunning: false
    property bool frontUpGreenLocked: false
    property bool canUseExtractRetract: true

    // Button colors - SAME machineBridge mapping
    property string leftExtractButtonColor: machineBridge.getCommandButtonColor(0x08)
    property string leftRetractButtonColor: machineBridge.getCommandButtonColor(0x09)
    property string frontUpButtonColor: machineBridge.getCommandButtonColor(0x0E)
    property string frontDownButtonColor: machineBridge.getCommandButtonColor(0x0F)
    property string rightRetractButtonColor: machineBridge.getCommandButtonColor(0x0B)
    property string rightExtractButtonColor: machineBridge.getCommandButtonColor(0x0A)
    property string rearUpButtonColor: machineBridge.getCommandButtonColor(0x0C)
    property string rearDownButtonColor: machineBridge.getCommandButtonColor(0x0D)

    // ================= UI COLORS =================
    property string bg0: "#091016"
    property string cardBg: "#131c22"
    property string cardBg2: "#111a20"
    property string lineColor: "#11e4de"
    property string lineSoft: "#11e4de"
    property string textMain: "#e6ecef"
    property string textDim: "#7f8d96"
    property string cyan: "#11e4de"
    property string cyanSoft: "#7cffc7"
    property string amber: "#e6a900"
    property string amberDark: "#bd8a00"
    property string green: "#00e676"
    property string red: "#dc3545"
    property string blue: "#007bff"
    property string btnNormal: "#11191f"
    property string btnHover: "#17232a"

    function mappedSuctionValue(v) {
        var speed = Math.round(v)
        if (speed >= 5) {
            var mappedSpeed = Math.round(10 + ((speed - 5) * 90 / 95))
            if (mappedSpeed > 100) mappedSpeed = 100
            if (mappedSpeed < 10) mappedSpeed = 10
            return mappedSpeed
        }
        return 0
    }

    function overrideColor(c) {
        if (c === "blue") return blue
        if (c === "green") return green
        if (c === "red") return red
        return ""
    }

    function controlBg(c, active, pressed, enabled) {
        var oc = overrideColor(c)
        if (oc !== "") return oc
        if (!enabled) return "#0d1419"
        if (active) return amber
        if (pressed) return "#22c55e"
        return btnNormal
    }

    function controlBorder(c, active, pressed) {
        if (overrideColor(c) !== "") return overrideColor(c)
        if (active) return "#ffd24d"
        if (pressed) return "#59e58d"
        return cyan
    }

    function controlText(active, pressed, enabled) {
        if (!enabled) return textDim
        if (active) return "#050708"
        if (pressed) return "#ffffff"
        return textMain
    }


    function canRunFrontExtractRetract() {
        if (!page.frontDownOn) {
            console.log("EXTRACT/RETRACT blocked: FRONT DOWN is not ON")
            return false
        }

        if (!page.frontDownReady) {
            console.log("EXTRACT/RETRACT blocked: FRONT DOWN 10 sec not complete")
            return false
        }

        return true
    }

    Connections {
        target: machineBridge

        onCommandButtonColorChanged: {
            var cmd = arguments[0]
            var color = arguments[1]
            console.log("FollowUpPage QML color signal received cmd:", cmd, "color:", color)

            if (cmd === 0x08) page.leftExtractButtonColor = color
            else if (cmd === 0x09) page.leftRetractButtonColor = color
            else if (cmd === 0x0E) {
                if (page.frontUpGreenLocked) {
                    page.frontUpButtonColor = "green"
                } else {
                    page.frontUpButtonColor = color
                }
            }
            else if (cmd === 0x0F) page.frontDownButtonColor = color
            else if (cmd === 0x0B) page.rightRetractButtonColor = color
            else if (cmd === 0x0A) page.rightExtractButtonColor = color
            else if (cmd === 0x0C) page.rearUpButtonColor = color
            else if (cmd === 0x0D) page.rearDownButtonColor = color
        }
    }

    Component.onCompleted: {
        page.leftExtractButtonColor = machineBridge.getCommandButtonColor(0x08)
        page.leftRetractButtonColor = machineBridge.getCommandButtonColor(0x09)
        page.frontUpButtonColor = machineBridge.getCommandButtonColor(0x0E)
        page.frontDownButtonColor = machineBridge.getCommandButtonColor(0x0F)
        page.rightRetractButtonColor = machineBridge.getCommandButtonColor(0x0B)
        page.rightExtractButtonColor = machineBridge.getCommandButtonColor(0x0A)
        page.rearUpButtonColor = machineBridge.getCommandButtonColor(0x0C)
        page.rearDownButtonColor = machineBridge.getCommandButtonColor(0x0D)
        
        refreshA25Data()
        a25RefreshTimer.start()

        console.log("FollowUpPage loaded. ASSETS PATH =", appController.assetsPath)
    }
    
    Connections {
        target: machineBridge
        onA25Changed: refreshA25Data()
    }
    
    Timer {
        id: a25RefreshTimer
        interval: 200
        repeat: true
        onTriggered: refreshA25Data()
    }

    Timer {
        id: frontTimerDisplayTimer
        interval: 1000
        repeat: true
        running: page.frontUpRetractRunning || (page.frontDownOn && !page.frontDownReady)

        onTriggered: {
            page.frontTimerTick = page.frontTimerTick + 1

            if (page.frontUpRetractRunning) {
                var upElapsed = Date.now() - page.frontUpTimestamp
                page.frontUpRemainingSec = Math.max(0, Math.ceil((10000 - upElapsed) / 1000))
            }

            if (page.frontDownOn && !page.frontDownReady) {
                var downElapsed = Date.now() - page.frontDownTimestamp
                page.frontDownRemainingSec = Math.max(0, Math.ceil((10000 - downElapsed) / 1000))
            }
        }
    }

    Timer {
        id: frontUpRetractTimer
        interval: 10000
        repeat: false

        onTriggered: {
            console.log("FRONT UP 10 sec complete -> RETRACT OFF, UP GREEN")

            // retract sequence stop
            page.frontUpRetractRunning = false
            page.frontUpRemainingSec = 0

            // dono retract UI normal
            page.leftRetractPressed = false
            page.rightRetractPressed = false
            page.leftBrushMoveMode = ""
            page.rightBrushMoveMode = ""

            // UP final UI turant GREEN karo
            page.frontUpOn = true
            page.frontDownOn = false
            page.frontUpGreenLocked = true
            page.frontUpButtonColor = "green"
            page.frontDownButtonColor = "default"

            page.frontLeftActive = false
            page.frontRightActive = false

            // pehle UP ON bhejo, fir retract OFF
            machineBridge.brushUp()

            machineBridge.brushLeftRightOff()
            machineBridge.brushRightRightOff()
        }
    }

    Timer {
        id: frontDownReadyTimer
        interval: 10000
        repeat: false

        onTriggered: {
            console.log("FRONT DOWN 10 sec complete -> EXTRACT/RETRACT ENABLED")

            if (page.frontDownOn) {
                page.frontDownReady = true
                page.frontDownRemainingSec = 0
                page.canUseExtractRetract = true
            }
        }
    }

    Timer {
        id: extractRetractTimer
        interval: 100
        repeat: true
        running: frontDownOn
        onTriggered: {
            var elapsed = Date.now() - frontDownTimestamp
            if (page.frontDownOn && elapsed >= 10000) {
                canUseExtractRetract = true
            } else {
                canUseExtractRetract = false
            }
            extractRetractWaitText.text = extractRetractWaitText.text
        }
    }

    onFrontDownOnChanged: {
        if (!frontDownOn) {
            frontDownReadyTimer.stop()
            frontDownReady = false
            canUseExtractRetract = false
        }
    }

    // ================= BACKGROUND GRID =================
    Canvas {
        anchors.fill: parent
        opacity: 0.22

        onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            ctx.strokeStyle = "#22313a"
            ctx.lineWidth = 1

            for (var x = 0; x < width; x += 28) {
                ctx.beginPath()
                ctx.moveTo(x, 0)
                ctx.lineTo(x, height)
                ctx.stroke()
            }

            for (var y = 0; y < height; y += 28) {
                ctx.beginPath()
                ctx.moveTo(0, y)
                ctx.lineTo(width, y)
                ctx.stroke()
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 8
        spacing: 18

        // ================= FRONT BRUSHES CARD =================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 318
            radius: 7
            color: cardBg
            border.color: cyan
            border.width: 2
            clip: true

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                // Header
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 45
                    color: cardBg2
                    border.color: cyan
                    border.width: 1

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 20
                        spacing: 10

                        Rectangle {
                            Layout.preferredWidth: 6
                            Layout.preferredHeight: 20
                            radius: 3
                            color: cyan
                        }

                        Text {
                            text: "FRONT BRUSHES"
                            color: textMain
                            font.pixelSize: 16
                            font.bold: true
                        }

                        Item { Layout.fillWidth: true }

                        Text {
                            text: "TP-2  ·  01"
                            color: textDim
                            font.pixelSize: 11
                            font.bold: true
                        }
                    }
                }

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 58
                        anchors.rightMargin: 58
                        anchors.topMargin: 20
                        anchors.bottomMargin: 16
                        spacing: 40

                        // LEFT CONTROL CLUSTER
                        ColumnLayout {
                            Layout.preferredWidth: 210
                            Layout.fillHeight: true
                            spacing: 10

                            Button {
                                text: "RETRACT"
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 70
                                enabled: (page.frontDownOn && page.frontDownReady) || page.frontUpRetractRunning
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.frontUpRetractRunning ? page.green : page.controlBg(page.leftBrushMoveMode === "leftRetract" ? page.leftRetractButtonColor : "", false, page.leftRetractPressed && page.leftBrushMoveMode === "leftRetract", parent.enabled)
                                    border.color: page.frontUpRetractRunning ? page.green : page.controlBorder(page.leftBrushMoveMode === "leftRetract" ? page.leftRetractButtonColor : "", false, page.leftRetractPressed && page.leftBrushMoveMode === "leftRetract")
                                    border.width: 2
                                    opacity: parent.enabled ? 1 : 0.45
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.frontUpRetractRunning ? "#ffffff" : page.controlText(false, page.leftRetractPressed && page.leftBrushMoveMode === "leftRetract", parent.enabled)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onPressed: {
                                    if (!page.canRunFrontExtractRetract()) return

                                    // LEFT: RETRACT active, EXTRACT force off
                                    page.leftBrushMoveMode = "leftRetract"
                                    page.leftExtractPressed = false
                                    machineBridge.brushLeftLeftOff()

                                    page.leftRetractPressed = true
                                    machineBridge.brushLeftRightOn()
                                    page.frontLeftActive = true
                                }

                                onReleased: {
                                    if (page.leftBrushMoveMode === "leftRetract") {
                                        page.leftRetractPressed = false
                                        page.leftBrushMoveMode = ""
                                        machineBridge.brushLeftRightOff()
                                        page.frontLeftActive = page.frontDownOn
                                    }
                                }
                            }

                            Button {
                                text: "EXTRACT"
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 70
                                enabled: page.frontDownOn && page.frontDownReady
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.controlBg(page.leftBrushMoveMode === "leftExtract" ? page.leftExtractButtonColor : "", false, page.leftExtractPressed && page.leftBrushMoveMode === "leftExtract", parent.enabled)
                                    border.color: page.controlBorder(page.leftBrushMoveMode === "leftExtract" ? page.leftExtractButtonColor : "", false, page.leftExtractPressed && page.leftBrushMoveMode === "leftExtract")
                                    border.width: 2
                                    opacity: parent.enabled ? 1 : 0.45
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.controlText(false, page.leftExtractPressed && page.leftBrushMoveMode === "leftExtract", parent.enabled)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onPressed: {
                                    if (!page.canRunFrontExtractRetract()) return

                                    // LEFT: EXTRACT active, RETRACT force off
                                    page.leftBrushMoveMode = "leftExtract"
                                    page.leftRetractPressed = false
                                    machineBridge.brushLeftRightOff()

                                    page.leftExtractPressed = true
                                    machineBridge.brushLeftLeftOn()
                                    page.frontLeftActive = true
                                }

                                onReleased: {
                                    if (page.leftBrushMoveMode === "leftExtract") {
                                        page.leftExtractPressed = false
                                        page.leftBrushMoveMode = ""
                                        machineBridge.brushLeftLeftOff()
                                        page.frontLeftActive = page.frontDownOn
                                    }
                                }
                            }
                        }

                        // LEFT SVG ICON
                        ColumnLayout {
                            Layout.preferredWidth: 90
                            Layout.fillHeight: true
                            spacing: 5
                            Layout.alignment: Qt.AlignVCenter
                            
                            // Distance text
                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: a25DistanceCm.toFixed(1) + " cm"
                                color: cyan
                                font.pixelSize: 14
                                font.bold: true
                            }
                            
                            // Battery tower indicator
                            RowLayout {
                                Layout.alignment: Qt.AlignHCenter
                                Layout.preferredHeight: 30
                                spacing: 3
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 50) ? 8 : 2
                                    color: (a25DistanceCm <= 50) ? green : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 40) ? 14 : 2
                                    color: (a25DistanceCm <= 40) ? green : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 30) ? 20 : 2
                                    color: (a25DistanceCm <= 30) ? amber : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 10) ? 26 : 2
                                    color: (a25DistanceCm <= 10) ? red : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 0) ? 30 : 2
                                    color: (a25DistanceCm <= 0) ? red : textDim
                                    radius: 1
                                }
                            }
                            
                            // SVG Icon
                            Item {
                                Layout.preferredWidth: 90
                                Layout.preferredHeight: 90
                                Layout.alignment: Qt.AlignHCenter
                                
                                RotatingPngIcon {
                                    anchors.centerIn: parent
                                    active: page.frontLeftActive
                                    imageSource: appController.assetsPath + "/left1.svg"
                                    iconSize: 80
                                    reverse: false
                                }
                            }
                        }

                        Item { Layout.fillWidth: true }

                        // FRONT CENTER CONTROL
                        ColumnLayout {
                            Layout.preferredWidth: 320
                            Layout.fillHeight: true
                            spacing: 8

                            Button {
                                text: "UP"
                                Layout.preferredWidth: 150
                                Layout.preferredHeight: 56
                                Layout.alignment: Qt.AlignHCenter
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.controlBg(page.frontUpButtonColor, page.frontUpOn, false, true)
                                    border.color: page.controlBorder(page.frontUpButtonColor, page.frontUpOn, false)
                                    border.width: 2
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.controlText(page.frontUpOn, false, true)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onClicked: {
                                    console.log("FRONT UP clicked -> UP YELLOW + RETRACT GREEN 10 sec")

                                    // agar UP already green hai to OFF
                                    if (page.frontUpOn && !page.frontUpRetractRunning) {
                                        page.frontUpOn = false
                                        page.frontUpGreenLocked = false
                                        page.frontUpButtonColor = "default"
                                        machineBridge.brushUpOff()
                                        return
                                    }

                                    // DOWN off
                                    if (page.frontDownOn) {
                                        page.frontDownOn = false
                                        page.frontDownButtonColor = "default"
                                        machineBridge.brushDownOff()
                                    }

                                    // UP ko 10 sec ke liye YELLOW dikhana hai
                                    page.frontUpGreenLocked = false
                                    page.frontUpOn = true
                                    page.frontUpButtonColor = "default"

                                    // UP timer UI
                                    page.frontUpTimestamp = Date.now()
                                    page.frontUpRemainingSec = 10
                                    page.frontTimerTick = 0

                                    // retract sequence start
                                    page.frontUpRetractRunning = true
                                    page.canUseExtractRetract = false

                                    // extract force OFF
                                    page.leftExtractPressed = false
                                    page.rightExtractPressed = false
                                    machineBridge.brushLeftLeftOff()
                                    machineBridge.brushRightLeftOff()

                                    // dono RETRACT UI GREEN
                                    page.leftBrushMoveMode = "leftRetract"
                                    page.rightBrushMoveMode = "rightRetract"
                                    page.leftRetractPressed = true
                                    page.rightRetractPressed = true

                                    page.frontLeftActive = true
                                    page.frontRightActive = true

                                    // board retract ON
                                    machineBridge.brushLeftRightOn()
                                    machineBridge.brushRightRightOn()

                                    frontUpRetractTimer.restart()
                                }
                            }

                            Item {
                                Layout.preferredWidth: 160
                                Layout.preferredHeight: 8
                                Layout.alignment: Qt.AlignHCenter
                            }

                            Text {
                                id: extractRetractWaitText
                                Layout.alignment: Qt.AlignHCenter
                                color: amber
                                font.pixelSize: 12
                                font.bold: true
                                visible: page.frontUpRetractRunning || (page.frontDownOn && !page.frontDownReady)
                                text: {
                                    var tick = page.frontTimerTick

                                    if (page.frontUpRetractRunning) {
                                        return "UP WAIT " + page.frontUpRemainingSec + "s"
                                    }

                                    if (page.frontDownOn && !page.frontDownReady) {
                                        return "DOWN WAIT " + page.frontDownRemainingSec + "s"
                                    }

                                    return ""
                                }
                            }

                            RowLayout {
                                Layout.alignment: Qt.AlignHCenter
                                spacing: 12

                                Button {
                                    text: "DOWN"
                                    Layout.preferredWidth: 150
                                    Layout.preferredHeight: 58
                                    font.pixelSize: 15
                                    font.bold: true

                                    background: Rectangle {
                                        radius: 7
                                        color: page.controlBg(page.frontDownButtonColor, page.frontDownOn, false, true)
                                        border.color: page.controlBorder(page.frontDownButtonColor, page.frontDownOn, false)
                                        border.width: 2
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: page.controlText(page.frontDownOn, false, true)
                                        font: parent.font
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                    }

                                    onClicked: {
                                        console.log("FRONT DOWN clicked -> wait 10 sec for EXTRACT/RETRACT")

                                        // agar UP retract sequence chal rahi hai to stop
                                        if (page.frontUpRetractRunning) {
                                            frontUpRetractTimer.stop()
                                            page.frontUpRetractRunning = false

                                            page.leftRetractPressed = false
                                            page.rightRetractPressed = false
                                            page.leftBrushMoveMode = ""
                                            page.rightBrushMoveMode = ""

                                            machineBridge.brushLeftRightOff()
                                            machineBridge.brushRightRightOff()
                                        }

                                        if (!page.frontDownOn) {
                                            // UP off
                                            if (page.frontUpOn) {
                                                page.frontUpOn = false
                                                page.frontUpGreenLocked = false
                                                page.frontUpButtonColor = "default"
                                                machineBridge.brushUpOff()
                                            }

                                            page.frontDownOn = true
                                            page.frontUpOn = false

                                            // 10 sec tak disabled
                                            page.frontDownReady = false
                                            page.canUseExtractRetract = false
                                            page.frontDownTimestamp = Date.now()
                                            page.frontDownRemainingSec = 10
                                            page.frontTimerTick = 0

                                            machineBridge.brushDown()

                                            page.frontLeftActive = true
                                            page.frontRightActive = true

                                            frontDownReadyTimer.restart()
                                        } else {
                                            page.frontDownOn = false
                                            page.frontDownReady = false
                                            page.frontDownRemainingSec = 0
                                            page.canUseExtractRetract = false

                                            frontDownReadyTimer.stop()

                                            machineBridge.brushDownOff()

                                            page.frontLeftActive = false
                                            page.frontRightActive = false
                                        }
                                    }
                                }
                            }
                        }

                        Item { Layout.fillWidth: true }

                        // RIGHT SVG ICON
                        ColumnLayout {
                            Layout.preferredWidth: 90
                            Layout.fillHeight: true
                            spacing: 5
                            Layout.alignment: Qt.AlignVCenter
                            
                            // Distance text
                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: a25DistanceCm.toFixed(1) + " cm"
                                color: cyan
                                font.pixelSize: 14
                                font.bold: true
                            }
                            
                            // Battery tower indicator
                            RowLayout {
                                Layout.alignment: Qt.AlignHCenter
                                Layout.preferredHeight: 30
                                spacing: 3
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 50) ? 8 : 2
                                    color: (a25DistanceCm <= 50) ? green : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 40) ? 14 : 2
                                    color: (a25DistanceCm <= 40) ? green : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 30) ? 20 : 2
                                    color: (a25DistanceCm <= 30) ? amber : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 10) ? 26 : 2
                                    color: (a25DistanceCm <= 10) ? red : textDim
                                    radius: 1
                                }
                                
                                Rectangle {
                                    Layout.preferredWidth: 6
                                    Layout.preferredHeight: (a25DistanceCm <= 0) ? 30 : 2
                                    color: (a25DistanceCm <= 0) ? red : textDim
                                    radius: 1
                                }
                            }
                            
                            // SVG Icon
                            Item {
                                Layout.preferredWidth: 90
                                Layout.preferredHeight: 90
                                Layout.alignment: Qt.AlignHCenter
                                
                                RotatingPngIcon {
                                    anchors.centerIn: parent
                                    active: page.frontRightActive
                                    imageSource: appController.assetsPath + "/right1.svg"
                                    iconSize: 80
                                    reverse: true
                                }
                            }
                        }

                        // RIGHT CONTROL CLUSTER
                        ColumnLayout {
                            Layout.preferredWidth: 210
                            Layout.fillHeight: true
                            spacing: 10

                            Button {
                                text: "RETRACT"
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 70
                                enabled: (page.frontDownOn && page.frontDownReady) || page.frontUpRetractRunning
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.frontUpRetractRunning ? page.green : page.controlBg(page.rightBrushMoveMode === "rightRetract" ? page.rightRetractButtonColor : "", false, page.rightRetractPressed && page.rightBrushMoveMode === "rightRetract", parent.enabled)
                                    border.color: page.frontUpRetractRunning ? page.green : page.controlBorder(page.rightBrushMoveMode === "rightRetract" ? page.rightRetractButtonColor : "", false, page.rightRetractPressed && page.rightBrushMoveMode === "rightRetract")
                                    border.width: 2
                                    opacity: parent.enabled ? 1 : 0.45
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.frontUpRetractRunning ? "#ffffff" : page.controlText(false, page.rightRetractPressed && page.rightBrushMoveMode === "rightRetract", parent.enabled)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onPressed: {
                                    if (!page.canRunFrontExtractRetract()) return

                                    // RIGHT: RETRACT active, EXTRACT force off
                                    page.rightBrushMoveMode = "rightRetract"
                                    page.rightExtractPressed = false
                                    machineBridge.brushRightLeftOff()

                                    page.rightRetractPressed = true
                                    machineBridge.brushRightRightOn()
                                    page.frontRightActive = true
                                }

                                onReleased: {
                                    if (page.rightBrushMoveMode === "rightRetract") {
                                        page.rightRetractPressed = false
                                        page.rightBrushMoveMode = ""
                                        machineBridge.brushRightRightOff()
                                        page.frontRightActive = page.frontDownOn
                                    }
                                }
                            }

                            Button {
                                text: "EXTRACT"
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 70
                                enabled: page.frontDownOn && page.frontDownReady
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.controlBg(page.rightBrushMoveMode === "rightExtract" ? page.rightExtractButtonColor : "", false, page.rightExtractPressed && page.rightBrushMoveMode === "rightExtract", parent.enabled)
                                    border.color: page.controlBorder(page.rightBrushMoveMode === "rightExtract" ? page.rightExtractButtonColor : "", false, page.rightExtractPressed && page.rightBrushMoveMode === "rightExtract")
                                    border.width: 2
                                    opacity: parent.enabled ? 1 : 0.45
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.controlText(false, page.rightExtractPressed && page.rightBrushMoveMode === "rightExtract", parent.enabled)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onPressed: {
                                    console.log("RIGHT EXTRACT BUTTON PRESSED! canUseExtractRetract:", canUseExtractRetract)
                                    if (!page.canRunFrontExtractRetract()) return

                                    // RIGHT: EXTRACT active, RETRACT force off
                                    page.rightBrushMoveMode = "rightExtract"
                                    page.rightRetractPressed = false
                                    machineBridge.brushRightRightOff()

                                    page.rightExtractPressed = true
                                    machineBridge.brushRightLeftOn()
                                    page.frontRightActive = true
                                }

                                onReleased: {
                                    console.log("RIGHT EXTRACT BUTTON RELEASED! canUseExtractRetract:", canUseExtractRetract)
                                    if (page.rightBrushMoveMode === "rightExtract") {
                                        page.rightExtractPressed = false
                                        page.rightBrushMoveMode = ""
                                        machineBridge.brushRightLeftOff()
                                        page.frontRightActive = page.frontDownOn
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ================= SUCTION SPEED CARD =================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 190
            radius: 7
            color: cardBg
            border.color: cyan
            border.width: 2
            clip: true

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 45
                    color: cardBg2
                    border.color: cyan
                    border.width: 1

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 20
                        spacing: 10

                        Rectangle {
                            Layout.preferredWidth: 6
                            Layout.preferredHeight: 20
                            radius: 3
                            color: cyan
                        }

                        Text {
                            text: "SUCTION SPEED"
                            color: textMain
                            font.pixelSize: 16
                            font.bold: true
                        }

                        Item { Layout.fillWidth: true }

                        Text {
                            text: "PA4  ·  DAC"
                            color: textDim
                            font.pixelSize: 11
                            font.bold: true
                        }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.leftMargin: 12
                    Layout.rightMargin: 28
                    Layout.topMargin: 12
                    Layout.bottomMargin: 10
                    spacing: 35

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 14

                        RowLayout {
                            Layout.fillWidth: true

                            Text {
                                text: "RAW  " + Math.round(suctionSlider.value) + "%"
                                color: textDim
                                font.pixelSize: 10
                                font.bold: true
                            }

                            Item { Layout.fillWidth: true }

                            Text {
                                text: "MAPPED  " + page.mappedSuctionValue(suctionSlider.value) + "%"
                                color: textDim
                                font.pixelSize: 10
                                font.bold: true
                            }
                        }

                        Slider {
                            id: suctionSlider
                            from: 0
                            to: 100
                            value: 0
                            enabled: true
                            Layout.fillWidth: true
                            Layout.preferredHeight: 46

                            function sendSuctionSpeed() {
                                var speed = Math.round(value)
                                console.log("FollowUpPage suction slider raw:", speed)

                                if (speed >= 5) {
                                    // UI 5% par board ko ON signal bhejna hai
                                    // Board 50 se ON maanta hai, isliye UI 5 -> BOARD 50
                                    var boardSpeed = Math.round(50 + ((speed - 5) * 50 / 95))

                                    if (boardSpeed > 100) boardSpeed = 100
                                    if (boardSpeed < 50) boardSpeed = 50

                                    console.log("UI suction:", speed, "BOARD signal:", boardSpeed)
                                    machineBridge.setSuctionSpeed(boardSpeed)
                                } else {
                                    console.log("UI suction below 5%, BOARD OFF")
                                    machineBridge.setSuctionSpeed(0)
                                }
                            }

                            property int lastSentRawSpeed: -1

                            onValueChanged: {
                                suctionGauge.requestPaint()

                                var rawSpeed = Math.round(value)

                                if (rawSpeed !== lastSentRawSpeed) {
                                    lastSentRawSpeed = rawSpeed
                                    sendSuctionSpeed()
                                }
                            }

                            onMoved: {
                                sendSuctionSpeed()
                            }

                            onPressedChanged: {
                                if (!pressed) {
                                    sendSuctionSpeed()
                                }
                            }

                            background: Item {
                                x: suctionSlider.leftPadding
                                y: suctionSlider.topPadding + suctionSlider.availableHeight / 2 - 4
                                width: suctionSlider.availableWidth
                                height: 9

                                Rectangle {
                                    anchors.fill: parent
                                    radius: 4
                                    color: "#0d151a"
                                    border.color: "#182329"
                                    border.width: 2
                                }

                                Rectangle {
                                    width: suctionSlider.visualPosition * parent.width
                                    height: parent.height
                                    radius: 4
                                    color: suctionSlider.value >= 5 ? amber : "#263238"
                                    opacity: 0.95
                                }
                            }

                            handle: Rectangle {
                                x: suctionSlider.leftPadding + suctionSlider.visualPosition * (suctionSlider.availableWidth - width)
                                y: suctionSlider.topPadding + suctionSlider.availableHeight / 2 - height / 2
                                implicitWidth: 28
                                implicitHeight: 28
                                radius: 14
                                color: "#9ed6d9"
                                border.color: "#f0d065"
                                border.width: 1
                            }
                        }

                        RowLayout {
                            Layout.fillWidth: true

                            Text { text: "0"; color: textDim; font.pixelSize: 10 }
                            Item { Layout.fillWidth: true }
                            Text { text: "20"; color: textDim; font.pixelSize: 10 }
                            Item { Layout.fillWidth: true }
                            Text { text: "40"; color: textDim; font.pixelSize: 10 }
                            Item { Layout.fillWidth: true }
                            Text { text: "60"; color: textDim; font.pixelSize: 10 }
                            Item { Layout.fillWidth: true }
                            Text { text: "100"; color: textDim; font.pixelSize: 10 }
                        }
                    }

                    Item {
                        Layout.preferredWidth: 150
                        Layout.preferredHeight: 118

                        Canvas {
                            id: suctionGauge
                            anchors.fill: parent

                            onPaint: {
                                var ctx = getContext("2d")
                                ctx.clearRect(0, 0, width, height)

                                var cx = width / 2
                                var cy = height - 8
                                var r = 58
                                var start = Math.PI
                                var end = Math.PI * 2
                                var val = page.mappedSuctionValue(suctionSlider.value)
                                var pct = val / 100
                                var mid = start + (end - start) * pct

                                ctx.lineWidth = 10
                                ctx.lineCap = "round"

                                ctx.strokeStyle = "#0d151a"
                                ctx.beginPath()
                                ctx.arc(cx, cy, r, start, end)
                                ctx.stroke()

                                ctx.strokeStyle = suctionSlider.value >= 5 ? page.amber : "#0d151a"
                                ctx.beginPath()
                                ctx.arc(cx, cy, r, start, mid)
                                ctx.stroke()

                                ctx.strokeStyle = "#7cf7d3"
                                ctx.lineWidth = 2
                                ctx.beginPath()
                                ctx.moveTo(cx, cy)
                                ctx.lineTo(cx + Math.cos(mid) * 46, cy + Math.sin(mid) * 46)
                                ctx.stroke()
                            }
                        }

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            anchors.top: parent.top
                            anchors.topMargin: 44
                            text: page.mappedSuctionValue(suctionSlider.value)
                            color: textMain
                            font.pixelSize: 24
                            font.bold: true
                        }

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            anchors.top: parent.top
                            anchors.topMargin: 73
                            text: "PA4"
                            color: textDim
                            font.pixelSize: 9
                            font.bold: true
                        }
                    }
                }
            }
        }

        // ================= REAR BRUSHES CARD =================
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 230
            radius: 7
            color: cardBg
            border.color: cyan
            border.width: 2
            clip: true

            ColumnLayout {
                anchors.fill: parent
                spacing: 0

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 34
                    color: cardBg2
                    border.color: cyan
                    border.width: 1

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 12
                        anchors.rightMargin: 20
                        spacing: 10

                        Rectangle {
                            Layout.preferredWidth: 6
                            Layout.preferredHeight: 20
                            radius: 3
                            color: cyan
                        }

                        Text {
                            text: "REAR BRUSHES"
                            color: textMain
                            font.pixelSize: 16
                            font.bold: true
                        }

                        Item { Layout.fillWidth: true }

                        Text {
                            text: "TP-2  ·  02"
                            color: textDim
                            font.pixelSize: 11
                            font.bold: true
                        }
                    }
                }

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 96
                        anchors.rightMargin: 96
                        anchors.topMargin: 6
                        anchors.bottomMargin: 6
                        spacing: 28

                        ColumnLayout {
                            Layout.preferredWidth: 140
                            Layout.fillHeight: true
                            spacing: 4

                            Item { Layout.fillHeight: true }

                            Item {
                                Layout.preferredWidth: 132
                                Layout.preferredHeight: 70
                                Layout.alignment: Qt.AlignHCenter

                                RotatingPngIcon {
                                    anchors.centerIn: parent
                                    active: page.rearLeftActive
                                    imageSource: appController.assetsPath + "/left1.svg"
                                    iconSize: 68
                                    reverse: false
                                }
                            }

                            RowLayout {
                                Layout.alignment: Qt.AlignHCenter
                                spacing: 6

                                Text {
                                    text: "PORT"
                                    color: textDim
                                    font.pixelSize: 10
                                    font.bold: true
                                }

                                Text {
                                    text: "·"
                                    color: textDim
                                    font.pixelSize: 11
                                }

                                Text {
                                    text: page.rearLeftActive ? "RUN" : "STOP"
                                    color: page.rearLeftActive ? green : textDim
                                    font.pixelSize: 10
                                    font.bold: true
                                }
                            }

                            Item { Layout.fillHeight: true }
                        }

                        Item { Layout.fillWidth: true }

                        ColumnLayout {
                            Layout.preferredWidth: 220
                            Layout.fillHeight: true
                            spacing: 4

                            Button {
                                text: "UP"
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 70
                                Layout.alignment: Qt.AlignHCenter
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.controlBg(page.rearUpButtonColor, page.rearUpOn, false, true)
                                    border.color: page.controlBorder(page.rearUpButtonColor, page.rearUpOn, false)
                                    border.width: 2
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.controlText(page.rearUpOn, false, true)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onClicked: {
                                    if (!page.rearUpOn) {
                                        page.rearUpOn = true
                                        page.rearDownOn = false
                                        machineBridge.rearBrushUp()
                                        page.rearLeftActive = false
                                        page.rearRightActive = false
                                    } else {
                                        page.rearUpOn = false
                                        machineBridge.rearBrushUpOff()
                                    }
                                }
                            }

                            Item {
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 8
                                Layout.alignment: Qt.AlignHCenter
                            }

                            Button {
                                text: "DOWN"
                                Layout.preferredWidth: 200
                                Layout.preferredHeight: 70
                                Layout.alignment: Qt.AlignHCenter
                                font.pixelSize: 15
                                font.bold: true

                                background: Rectangle {
                                    radius: 7
                                    color: page.controlBg(page.rearDownButtonColor, page.rearDownOn, false, true)
                                    border.color: page.controlBorder(page.rearDownButtonColor, page.rearDownOn, false)
                                    border.width: 2
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: page.controlText(page.rearDownOn, false, true)
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                onClicked: {
                                    if (!page.rearDownOn) {
                                        page.rearDownOn = true
                                        page.rearUpOn = false
                                        machineBridge.rearBrushDown()
                                        page.rearLeftActive = true
                                        page.rearRightActive = true
                                    } else {
                                        page.rearDownOn = false
                                        machineBridge.rearBrushDownOff()
                                        page.rearLeftActive = false
                                        page.rearRightActive = false
                                    }
                                }
                            }
                        }

                        Item { Layout.fillWidth: true }

                        ColumnLayout {
                            Layout.preferredWidth: 140
                            Layout.fillHeight: true
                            spacing: 4

                            Item { Layout.fillHeight: true }

                            Item {
                                Layout.preferredWidth: 132
                                Layout.preferredHeight: 70
                                Layout.alignment: Qt.AlignHCenter

                                RotatingPngIcon {
                                    anchors.centerIn: parent
                                    active: page.rearRightActive
                                    imageSource: appController.assetsPath + "/right1.svg"
                                    iconSize: 68
                                    reverse: true
                                }
                            }

                            RowLayout {
                                Layout.alignment: Qt.AlignHCenter
                                spacing: 6

                                Text {
                                    text: "STBD"
                                    color: textDim
                                    font.pixelSize: 10
                                    font.bold: true
                                }

                                Text {
                                    text: "·"
                                    color: textDim
                                    font.pixelSize: 11
                                }

                                Text {
                                    text: page.rearRightActive ? "RUN" : "STOP"
                                    color: page.rearRightActive ? green : textDim
                                    font.pixelSize: 10
                                    font.bold: true
                                }
                            }

                            Item { Layout.fillHeight: true }
                        }
                    }
                }
            }
        }   

        // Old test popup functionality kept, but hidden to match the new UI design.
        Button {
            visible: false
            text: "Test Error Popup"

            onClicked: {
                appController.showError("Test Error Message — this is a test popup!", "error")
                Qt.callLater(function() {
                    appController.showError("Test Warning Message — this is a test warning popup!", "warning")
                }, 1000)
            }
        }
    }
}