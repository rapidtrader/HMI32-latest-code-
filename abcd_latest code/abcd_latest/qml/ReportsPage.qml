import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: page
    color: root.bg

    property real suctionSeconds: 0
    property real suctionHours: 0
    property variant dailyRuntimes: []
    property variant suctionSessions: []
    property Timer refreshTimer: Timer {
    interval: 2000
    repeat: true
    running: appController.currentPage === "ReportsPage"
    onTriggered: {
      page.suctionSeconds = machineBridge.getSuctionRuntimeSeconds()
      page.suctionHours = page.suctionSeconds / 3600.0
      page.dailyRuntimes = machineBridge.getDailyRuntimes()
      page.suctionSessions = machineBridge.getSuctionSessions()
    }
  }

  Component.onCompleted: {
    if (appController.currentPage === "ReportsPage") {
      page.suctionSeconds = machineBridge.getSuctionRuntimeSeconds()
      page.suctionHours = page.suctionSeconds / 3600.0
      page.dailyRuntimes = machineBridge.getDailyRuntimes()
      page.suctionSessions = machineBridge.getSuctionSessions()
      sessionsList.refreshSessions()
      chartCanvas.requestPaint()
    }
  }

  Connections {
    target: appController
    function onCurrentPageChanged() {
      if (appController.currentPage === "ReportsPage") {
        page.suctionSeconds = machineBridge.getSuctionRuntimeSeconds()
        page.suctionHours = page.suctionSeconds / 3600.0
        page.dailyRuntimes = machineBridge.getDailyRuntimes()
        page.suctionSessions = machineBridge.getSuctionSessions()
        sessionsList.refreshSessions()
        chartCanvas.requestPaint()
      }
    }
  }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 20

        // Header
        Column {
            Layout.alignment: Qt.AlignHCenter
            spacing: 8

            Text {
                text: "REPORTS"
                color: root.iconColor
                font.pixelSize: 32
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
            }

            Rectangle {
                width: 180
                height: 3
                color: root.iconColor
                anchors.horizontalCenter: parent.horizontalCenter
            }

            Text {
                text: "Function runtime and usage statistics."
                color: root.textDim
                font.pixelSize: 13
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
            }
        }

        // Main panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: root.bgCard
            border.color: root.borderHover
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 14
                spacing: 12

                Text {
                    text: "REPORTS PANEL"
                    color: root.textDim
                    font.family: "Consolas"
                    font.pixelSize: 11
                    font.bold: true
                    Layout.fillWidth: true
                }

                Rectangle {
                    height: 1
                    color: root.borderHover
                    Layout.fillWidth: true
                }

                // Top row: Suction runtime card + chart
                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 14

                    // Suction runtime card
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        Layout.minimumWidth: 280
                        Layout.maximumWidth: 320
                        color: root.bgCard
                        border.color: root.borderHover
                        border.width: 1

                        Rectangle {
                            anchors.top: parent.top
                            anchors.left: parent.left
                            anchors.right: parent.right
                            height: 4
                            color: root.iconColor
                        }

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 18
                            spacing: 4

                            Text {
                                text: "SUCTION"
                                color: root.text
                                font.pixelSize: 16
                                font.bold: true
                            }

                            Text {
                                text: "Total running time (Functions module)"
                                color: root.textDim
                                font.pixelSize: 11
                                Layout.topMargin: 2
                                Layout.bottomMargin: 10
                            }

                            Text {
                                text: page.suctionHours.toFixed(2) + " hrs"
                                color: root.iconColor
                                font.family: "Consolas"
                                font.pixelSize: 28
                                font.bold: true
                            }

                            Text {
                                text: Math.floor(page.suctionSeconds) + " sec"
                                color: root.textDim
                                font.family: "Consolas"
                                font.pixelSize: 14
                            }
                        }
                    }

                    // Chart card
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        Layout.minimumHeight: 280
                        color: root.bgCard
                        border.color: root.borderHover
                        border.width: 1

                        Rectangle {
                            anchors.top: parent.top
                            anchors.left: parent.left
                            anchors.right: parent.right
                            height: 4
                            color: root.iconColor
                        }

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 14
                            spacing: 8

                            Text {
                                text: "SUCTION BY DATE (HH:MM:SS)"
                                color: root.text
                                font.pixelSize: 14
                                font.bold: true
                                Layout.alignment: Qt.AlignLeft
                            }

                            Canvas {
                                id: chartCanvas
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                Layout.topMargin: 8
                                Layout.bottomMargin: 12

                                readonly property int chartMaxDays: 14
                                readonly property int paddingLeft: 50
                                readonly property int paddingRight: 20
                                readonly property int paddingTop: 20
                                readonly property int paddingBottom: 36
                                readonly property int yTicks: 5

                                function formatDurationHms(seconds) {
                                    let totalSec = Math.floor(Math.max(0, seconds))
                                    let h = Math.floor(totalSec / 3600)
                                    let m = Math.floor((totalSec % 3600) / 60)
                                    let s = totalSec % 60
                                    return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2)
                                }

                                onPaint: {
                                    let ctx = getContext("2d")
                                    ctx.reset()

                                    let w = width
                                    let h = height

                                    if (page.dailyRuntimes.length === 0) {
                                        ctx.fillStyle = root.textDim
                                        ctx.font = "14px Segoe UI"
                                        ctx.textAlign = "center"
                                        ctx.textBaseline = "middle"
                                        ctx.fillText("No data yet", w / 2, h / 2)
                                        return
                                    }

                                    if (w < 150 || h < 120) {
                                        return
                                    }

                                    let data = page.dailyRuntimes.slice(-this.chartMaxDays)
                                    let maxSec = 1
                                    for (let i = 0; i < data.length; i++) {
                                        if (data[i][1] > maxSec) {
                                            maxSec = data[i][1]
                                        }
                                    }

                                    // Chart area
                                    let chartLeft = this.paddingLeft
                                    let chartRight = w - this.paddingRight
                                    let chartTop = this.paddingTop
                                    let chartBottom = h - this.paddingBottom
                                    let chartW = chartRight - chartLeft
                                    let chartH = chartBottom - chartTop

                                    // Y-axis grid and labels
                                    for (let i = 0; i <= this.yTicks; i++) {
                                        let y = chartBottom - (i / this.yTicks) * chartH
                                        let secVal = (i / this.yTicks) * maxSec
                                        ctx.strokeStyle = root.border
                                        ctx.setLineDash([2, 2])
                                        ctx.lineWidth = 1
                                        ctx.beginPath()
                                        ctx.moveTo(chartLeft, y)
                                        ctx.lineTo(chartRight, y)
                                        ctx.stroke()
                                        ctx.setLineDash([])

                                        ctx.fillStyle = root.textDim
                                        ctx.font = "9px Consolas"
                                        ctx.textAlign = "right"
                                        ctx.textBaseline = "middle"
                                        ctx.fillText(this.formatDurationHms(secVal), chartLeft - 6, y)
                                    }

                                    // X-axis baseline
                                    ctx.strokeStyle = root.textDim
                                    ctx.lineWidth = 2
                                    ctx.beginPath()
                                    ctx.moveTo(chartLeft, chartBottom)
                                    ctx.lineTo(chartRight, chartBottom)
                                    ctx.stroke()

                                    // Bars
                                    let barGap = 6
                                    let n = data.length
                                    let barW = Math.max(20, Math.floor((chartW - (n - 1) * barGap) / n))
                                    let totalBarWidth = n * barW + (n - 1) * barGap
                                    let startX = chartLeft + (chartW - totalBarWidth) / 2 + barW / 2

                                    for (let i = 0; i < data.length; i++) {
                                        let item = data[i]
                                        let dateStr = item[0] || item.date || ""
                                        let sec = Number(item[1] || item.seconds || 0)
                                        let barH = (sec / maxSec) * chartH
                                        barH = Math.max(8, barH)
                                        let cx = startX + i * (barW + barGap)
                                        let x1 = cx - barW / 2
                                        let x2 = cx + barW / 2
                                        let y1 = chartBottom - barH
                                        let y2 = chartBottom

                                        // Draw bar
                                        ctx.fillStyle = root.iconColor
                                        ctx.strokeStyle = root.borderHover
                                        ctx.lineWidth = 1
                                        ctx.fillRect(x1, y1, barW, barH)
                                        ctx.strokeRect(x1, y1, barW, barH)

                                        // Date label
                                        let parts = dateStr.split("-")
                                        let label = (parts.length >= 3) ? (parts[2] + "/" + parts[1]) : ""
                                        ctx.fillStyle = root.textDim
                                        ctx.font = "10px Consolas"
                                        ctx.textAlign = "center"
                                        ctx.textBaseline = "top"
                                        ctx.fillText(label, cx, chartBottom + 14)

                                        // Time on top of bar
                                        let timeText = this.formatDurationHms(sec)
                                        ctx.fillStyle = root.text
                                        ctx.font = "bold 9px Consolas"
                                        ctx.textBaseline = "bottom"
                                        ctx.fillText(timeText, cx, y1 - 6)
                                    }
                                }

                                Connections {
                                    target: page
                                    function onDailyRuntimesChanged() {
                                        chartCanvas.requestPaint()
                                    }
                                }
                            }
                        }
                    }
                }

                // Sessions table card
                Rectangle {
                    Layout.fillWidth: true
                    Layout.minimumHeight: 220
                    Layout.preferredHeight: 280
                    color: root.bgCard
                    border.color: root.borderHover
                    border.width: 1

                    Rectangle {
                        anchors.top: parent.top
                        anchors.left: parent.left
                        anchors.right: parent.right
                        height: 4
                        color: root.iconColor
                    }

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 14
                        spacing: 6

                        Text {
                            text: "SUCTION RUN/IDLE LOG"
                            color: root.text
                            font.pixelSize: 14
                            font.bold: true
                            Layout.alignment: Qt.AlignLeft
                        }

                        // Header row
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 28
                            color: root.bgCardHover

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 4
                                anchors.rightMargin: 4
                                spacing: 0

                                Text { text: "Machine ID"; Layout.preferredWidth: 120; color: root.text; font.family: "Consolas"; font.pixelSize: 10; font.bold: true; horizontalAlignment: Text.AlignHCenter }
                                Text { text: "Date"; Layout.preferredWidth: 110; color: root.text; font.family: "Consolas"; font.pixelSize: 10; font.bold: true; horizontalAlignment: Text.AlignHCenter }
                                Text { text: "Start Time"; Layout.preferredWidth: 110; color: root.text; font.family: "Consolas"; font.pixelSize: 10; font.bold: true; horizontalAlignment: Text.AlignHCenter }
                                Text { text: "Stop Time"; Layout.preferredWidth: 110; color: root.text; font.family: "Consolas"; font.pixelSize: 10; font.bold: true; horizontalAlignment: Text.AlignHCenter }
                                Text { text: "Duration"; Layout.preferredWidth: 120; color: root.text; font.family: "Consolas"; font.pixelSize: 10; font.bold: true; horizontalAlignment: Text.AlignHCenter }
                            }
                        }

                        // Table rows
                        ListView {
                            id: sessionsList
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true

                            model: ListModel {
                                id: sessionsModel
                            }

                            delegate: Rectangle {
                                width: ListView.view.width
                                height: 24
                                color: index % 2 === 0 ? root.bgCard : root.bg

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 4
                                    anchors.rightMargin: 4
                                    spacing: 0

                                    Text { text: model.machineId; Layout.preferredWidth: 120; color: root.text; font.family: "Consolas"; font.pixelSize: 10; horizontalAlignment: Text.AlignHCenter }
                                    Text { text: model.date; Layout.preferredWidth: 110; color: root.text; font.family: "Consolas"; font.pixelSize: 10; horizontalAlignment: Text.AlignHCenter }
                                    Text { text: model.start; Layout.preferredWidth: 110; color: root.text; font.family: "Consolas"; font.pixelSize: 10; horizontalAlignment: Text.AlignHCenter }
                                    Text { text: model.stop; Layout.preferredWidth: 110; color: root.text; font.family: "Consolas"; font.pixelSize: 10; horizontalAlignment: Text.AlignHCenter }
                                    Text { text: model.duration; Layout.preferredWidth: 120; color: root.text; font.family: "Consolas"; font.pixelSize: 10; horizontalAlignment: Text.AlignHCenter }
                                }
                            }

                            function formatDuration(sec) {
                                let totalSec = Math.floor(Math.max(0, sec))
                                let h = Math.floor(totalSec / 3600)
                                let m = Math.floor((totalSec % 3600) / 60)
                                let s = totalSec % 60
                                if (h > 0) {
                                    return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2)
                                } else {
                                    return ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2)
                                }
                            }

                            function refreshSessions() {
                                sessionsModel.clear()
                                let sessions = page.suctionSessions.slice().reverse()
                                for (let i = 0; i < sessions.length; i++) {
                                    let entry = sessions[i]
                                    let machineId = entry.machine_id || entry.machineId || "-"
                                    let dateStr = entry.date || ""
                                    let startStr = entry.start || ""
                                    let stopStr = entry.stop || "—"
                                    let durationSec = entry.duration_sec || 0.0

                                    sessionsModel.append({
                                        machineId: machineId,
                                        date: dateStr,
                                        start: startStr,
                                        stop: stopStr,
                                        duration: formatDuration(durationSec)
                                    })
                                }
                            }

                            Component.onCompleted: {
                                refreshSessions()
                            }

                            Connections {
                                target: page
                                function onSuctionSessionsChanged() {
                                    sessionsList.refreshSessions()
                                }
                            }
                        }
                    }
                }

                // Back button
                Item {
                    Layout.preferredHeight: 80
                    Layout.alignment: Qt.AlignHCenter

                    Rectangle {
                        anchors.centerIn: parent
                        color: root.borderHover

                        Rectangle {
                            anchors.fill: parent
                            anchors.margins: 2
                            color: "transparent"

                            Button {
                                anchors.fill: parent
                                text: "←  BACK"
                                font.pixelSize: 13
                                font.bold: true
                                background: Rectangle {
                                    color: parent.hovered ? root.bgCard : root.bg
                                }
                                contentItem: Text {
                                    text: parent.text
                                    color: root.iconColor
                                    font: parent.font
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }
                                onClicked: appController.showPage("FollowUpPage")
                            }
                        }
                    }
                }
            }
        }
    }
}
