import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: hmi32MonitorRoot
    color: root.bg
    anchors.fill: parent
    
    property var currentDistance: 0
    property var messageLog: []

    function formatCanId(id) {
        var n = Number(id)
        if (isNaN(n)) return "0x???"
        var hex = n.toString(16).toUpperCase()
        while (hex.length < 3) hex = "0" + hex
        return "0x" + hex
    }

    function formatDataBytes(d) {
        if (!d || d.length === undefined) return "—"
        var parts = []
        for (var i = 0; i < d.length; i++)
            parts.push(String(d[i]))
        return parts.join(" ")
    }

    function isErrorRow(row) {
        return row && (row.error || (row.error_msg && String(row.error_msg).length > 0))
    }

    function typeBadge(row) {
        if (!row || !row.type) return "CAN"
        if (row.type === "distance") return "DIST"
        if (row.type === "suction_analog" || row.type === "pa0_analog") return "ADC"
        if (row.type === "a25" || row.type === "a25_error") return "A25"
        if (row.type === "gpio") {
            if (row.direction === "ui") return "UI"
            if (row.direction === "tx") return "TX"
            if (row.direction === "rx") return "RX"
            return "GPIO"
        }
        return String(row.type).toUpperCase()
    }

    function summaryLine(row) {
        if (!row) return ""
        var idStr = formatCanId(row.arbitration_id)
        if (row.type === "distance")
            return idStr + " → " + (row.value !== undefined ? row.value : "?") + " cm"
        if (row.type === "suction_analog" || row.type === "pa0_analog")
            return idStr + " → ADC " + (row.value !== undefined ? row.value : "?")
        if (row.type === "a25" || row.type === "a25_error")
            return idStr + " → A25 " + (row.value !== undefined ? row.value : "?") + " mm"
        if (row.type === "gpio" || row.cmd !== undefined) {
            var st = !!row.state
            var line = idStr + " → " + (row.name || "Unknown") + " (" + (row.pin || "???") + ") " + (st ? "ON" : "OFF")
            if (row.note)
                line += " — " + row.note
            var err = row.error_msg || ""
            if (err)
                line += " (ERROR: " + err + ")"
            return line
        }
        return idStr + " → " + formatDataBytes(row.data)
    }
    
    function refreshData() {
        currentDistance = machineBridge.getCurrentDistance()
        var raw = machineBridge.getCanMessageLog()
        var reversed = []
        for (var i = raw.length - 1; i >= 0; i--)
            reversed.push(raw[i])
        messageLog = reversed
    }
    
    Component.onCompleted: {
        refreshData()
        autoRefreshTimer.start()
    }
    
    Connections {
        target: machineBridge
        onDistanceChanged: refreshData()
        onCanMessageLogChanged: refreshData()
    }
    
    Timer {
        id: autoRefreshTimer
        interval: 500
        repeat: true
        onTriggered: refreshData()
    }
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 15
        
        // Header
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 60
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            
            RowLayout {
                anchors.fill: parent
                anchors.margins: 15
                
                Text {
                    text: "HMI32 Real-Time Monitor"
                    color: root.iconColor
                    font.pixelSize: 24
                    font.bold: true
                    Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                }
                
                Item {
                    Layout.fillWidth: true
                }
                
                Button {
                    id: refreshBtn
                    text: "🔄 Refresh"
                    font.pixelSize: 14
                    font.bold: true
                    Layout.preferredWidth: 120
                    Layout.preferredHeight: 40
                    
                    background: Rectangle {
                        color: refreshBtn.hovered ? root.bgCardHover : root.bgCardActive
                        border.color: root.borderHover
                        border.width: 2
                        radius: 4
                    }
                    
                    contentItem: Text {
                        text: refreshBtn.text
                        color: root.text
                        font: refreshBtn.font
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    
                    onClicked: {
                        refreshData()
                        // Add a little pulse animation
                        refreshBtn.opacity = 0.6
                        refreshTimer.start()
                    }
                    
                    Timer {
                        id: refreshTimer
                        interval: 200
                        onTriggered: {
                            refreshBtn.opacity = 1
                        }
                    }
                }
            }
        }
        
      
        // Distance Display
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            
            RowLayout {
                anchors.fill: parent
                anchors.margins: 20
                
                Text {
                    text: "Distance"
                    color: root.textDim
                    font.pixelSize: 18
                    Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
                }
                
                Item {
                    Layout.fillWidth: true
                }
                
                Rectangle {
                    id: distanceBox
                    width: 200
                    height: 60
                    color: "#0a1a2a"
                    border.color: root.iconColor
                    border.width: 2
                    radius: 4
                    Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                    
                    Text {
                        id: distanceValue
                        anchors.centerIn: parent
                        text: currentDistance + " cm"
                        color: root.iconColor
                        font.pixelSize: 28
                        font.bold: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                }
            }
        }
        
        // Message Log
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: root.bgCard
            border.color: root.border
            border.width: 1
            radius: 4
            
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 15
                spacing: 10
                
                Text {
                    text: "CAN Message Log (Last " + messageLog.length + " Messages)"
                    color: root.textDim
                    font.pixelSize: 16
                    font.bold: true
                    Layout.alignment: Qt.AlignLeft
                }

                Text {
                    visible: messageLog.length === 0
                    text: "No messages yet — press any machine ON/OFF button; UI / TX / RX / errors appear here."
                    color: root.textDim
                    font.pixelSize: 13
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                
                ScrollView {
                    visible: messageLog.length > 0
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    
                    ListView {
                        id: messageListView
                        model: messageLog
                        spacing: 5
                        clip: true
                        
                        delegate: Rectangle {
                            width: messageListView.width
                            height: 52
                            property var row: modelData
                            color: {
                                if (hmi32MonitorRoot.isErrorRow(row))
                                    return "#3a0a0a"
                                if (row && row.type === "gpio" && row.state)
                                    return "#0a3a1a"
                                return index % 2 === 0 ? "#0a1621" : root.bg
                            }
                            radius: 3
                            border.color: hmi32MonitorRoot.isErrorRow(row) ? "#ff4444" : root.border
                            border.width: 1

                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 8
                                spacing: 10

                                Text {
                                    text: row && row.timestamp ? row.timestamp : "—"
                                    color: root.textDim
                                    font.pixelSize: 12
                                    font.family: root.fontMono
                                    Layout.preferredWidth: 110
                                }

                                Rectangle {
                                    width: 44
                                    height: 26
                                    radius: 4
                                    color: hmi32MonitorRoot.isErrorRow(row) ? "#aa0000" : "#1a3a2a"
                                    Text {
                                        anchors.centerIn: parent
                                        text: hmi32MonitorRoot.typeBadge(row)
                                        color: hmi32MonitorRoot.isErrorRow(row) ? "#ffaaaa" : "#00e676"
                                        font.pixelSize: 10
                                        font.bold: true
                                    }
                                }

                                Text {
                                    text: hmi32MonitorRoot.summaryLine(row)
                                    color: hmi32MonitorRoot.isErrorRow(row) ? "#ff8888" : root.text
                                    font.pixelSize: 12
                                    Layout.fillWidth: true
                                    elide: Text.ElideRight
                                    maximumLineCount: 2
                                    wrapMode: Text.WordWrap
                                }

                                Text {
                                    text: "[" + hmi32MonitorRoot.formatDataBytes(row ? row.data : null) + "]"
                                    color: root.textDim
                                    font.pixelSize: 11
                                    font.family: root.fontMono
                                    Layout.preferredWidth: 80
                                    horizontalAlignment: Text.AlignRight
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
