import QtQuick 2.12
import QtQuick.Controls 2.12
import QtQuick.Layouts 1.12

Rectangle {
    id: mapRoot
    color: root.bg

    readonly property real tileSize: 256
    property int mapZoom: 16
    property var tileUrls: []
    property real markerX: 0
    property real markerY: 0
    property bool mapReady: false
    property int gridCols: 3
    property int gridRows: 3
    property int lastTcx: -999
    property int lastTcy: -999
    property int lastZoom: -1
    property int lastGridCols: -1
    property int lastGridRows: -1

    function worldPixel(lat, lon, z) {
        var scale = tileSize * Math.pow(2, z)
        var x = (lon + 180.0) / 360.0 * scale
        var s = Math.sin(lat * Math.PI / 180.0)
        var y = (0.5 - Math.log((1.0 + s) / (1.0 - s)) / (4.0 * Math.PI)) * scale
        return { x: x, y: y }
    }

    function tileSource(z, tx, ty) {
        return gpsController.mapTileLocalUrl(z, tx, ty) || ""
    }

    function ensureGridCover(viewW, viewH) {
        if (viewW < 32 || viewH < 32)
            return
        var c = Math.ceil(viewW / tileSize)
        var r = Math.ceil(viewH / tileSize)
        if (c % 2 === 0)
            c++
        if (r % 2 === 0)
            r++
        c = Math.max(3, Math.min(c, 9))
        r = Math.max(3, Math.min(r, 9))
        if (c !== gridCols || r !== gridRows) {
            gridCols = c
            gridRows = r
            refreshMap()
        }
    }

    function rebuildTileList(z, tcx, tcy) {
        var halfX = Math.floor(gridCols / 2)
        var halfY = Math.floor(gridRows / 2)
        var tiles = []
        for (var dy = -halfY; dy <= halfY; dy++) {
            for (var dx = -halfX; dx <= halfX; dx++) {
                tiles.push({
                    px: (dx + halfX) * tileSize,
                    py: (dy + halfY) * tileSize,
                    url: tileSource(z, tcx + dx, tcy + dy)
                })
            }
        }
        tileUrls = tiles
        var prefetchR = Math.max(halfX, halfY)
        gpsController.prefetchMapTilesRadius(z, tcx, tcy, prefetchR)
    }

    function refreshMap() {
        if (!gpsController.hasCoordinates) {
            mapReady = false
            tileUrls = []
            return
        }
        var lat = gpsController.latitude
        var lon = gpsController.longitude
        var z = mapZoom
        var wp = worldPixel(lat, lon, z)
        var tcx = Math.floor(wp.x / tileSize)
        var tcy = Math.floor(wp.y / tileSize)
        var fx = wp.x - tcx * tileSize
        var fy = wp.y - tcy * tileSize

        markerX = (gridCols * tileSize) / 2 + (fx - tileSize / 2)
        markerY = (gridRows * tileSize) / 2 + (fy - tileSize / 2)

        var needTiles = (tcx !== lastTcx || tcy !== lastTcy || z !== lastZoom
            || gridCols !== lastGridCols || gridRows !== lastGridRows)

        if (needTiles) {
            rebuildTileList(z, tcx, tcy)
            lastTcx = tcx
            lastTcy = tcy
            lastZoom = z
            lastGridCols = gridCols
            lastGridRows = gridRows
        }
        mapReady = true
    }

    Timer {
        interval: 1500
        running: mapReady
        repeat: true
        onTriggered: {
            if (lastTcx >= 0) {
                var hx = Math.floor(gridCols / 2)
                var hy = Math.floor(gridRows / 2)
                gpsController.prefetchMapTilesRadius(mapZoom, lastTcx, lastTcy, Math.max(hx, hy))
            }
        }
    }

    Connections {
        target: gpsController
        onFixChanged: refreshMap()
    }

    Timer {
        interval: 1000
        running: mapReady
        repeat: true
        onTriggered: refreshMap()
    }

    Component.onCompleted: refreshMap()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            Text {
                Layout.fillWidth: true
                text: "Live Map"
                color: root.iconColor
                font.pixelSize: 20
                font.bold: true
            }
            Button {
                text: "−"
                implicitWidth: 40
                onClicked: { if (mapZoom > 10) { mapZoom--; refreshMap() } }
            }
            Text { text: "Z" + mapZoom; color: root.text; font.pixelSize: 12 }
            Button {
                text: "+"
                implicitWidth: 40
                onClicked: { if (mapZoom < 19) { mapZoom++; refreshMap() } }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Text {
                text: gpsController.hasCoordinates
                    ? (gpsController.latitude.toFixed(6) + ", " + gpsController.longitude.toFixed(6))
                    : "Waiting for GPS…"
                color: gpsController.fixValid ? root.accentGreen : root.accentOrange
                font.pixelSize: 11
                font.family: root.fontMono
            }
            Text {
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignRight
                text: gpsController.fixValid
                    ? (gpsController.speedKmh.toFixed(1) + " km/h")
                    : (gpsController.statusText || "")
                color: root.textDim
                font.pixelSize: 11
                elide: Text.ElideLeft
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 240
            color: "#243447"
            border.color: root.border
            border.width: 1
            radius: 4
            clip: true

            Item {
                id: mapArea
                anchors.fill: parent

                onWidthChanged: ensureGridCover(width, height)
                onHeightChanged: ensureGridCover(width, height)

                Component.onCompleted: ensureGridCover(width, height)

                Item {
                    id: tileLayer
                    width: mapRoot.tileSize * mapRoot.gridCols
                    height: mapRoot.tileSize * mapRoot.gridRows
                    visible: mapReady
                    x: mapArea.width / 2 - markerX
                    y: mapArea.height / 2 - markerY

                    Repeater {
                        model: tileUrls
                        delegate: Image {
                            id: tileImg
                            property string baseUrl: modelData.url
                            property int loadGen: 0
                            x: modelData.px
                            y: modelData.py
                            width: mapRoot.tileSize
                            height: mapRoot.tileSize
                            source: baseUrl + (loadGen > 0 ? "#" + loadGen : "")
                            asynchronous: true
                            cache: false
                            fillMode: Image.Stretch

                            Timer {
                                interval: 2500
                                running: tileImg.visible
                                    && baseUrl.length > 0
                                    && tileImg.status !== Image.Ready
                                repeat: true
                                onTriggered: tileImg.loadGen += 1
                            }

                            Connections {
                                target: gpsController
                                onMapTilesChanged: {
                                    if (tileImg.status !== Image.Ready)
                                        tileImg.loadGen += 1
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    anchors.centerIn: parent
                    width: 22
                    height: 22
                    radius: 11
                    color: "#00e676"
                    border.color: "#ffffff"
                    border.width: 2
                    visible: mapReady
                }

                Rectangle {
                    anchors.centerIn: parent
                    width: 2
                    height: parent.height
                    color: "#ffffff22"
                    visible: mapReady
                }
                Rectangle {
                    anchors.centerIn: parent
                    width: parent.width
                    height: 2
                    color: "#ffffff22"
                    visible: mapReady
                }
            }

            Text {
                anchors.centerIn: parent
                visible: !mapReady
                width: parent.width - 24
                wrapMode: Text.WordWrap
                horizontalAlignment: Text.AlignHCenter
                color: root.textDim
                font.pixelSize: 12
                text: "GPS fix required for live map.\nCheck antenna / open sky."
            }

            Text {
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                anchors.margins: 8
                color: "#e0e0e0"
                font.pixelSize: 9
                text: mapReady ? "Street map · tiles load in background" : ""
            }
        }

        Text {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: root.textDim
            font.pixelSize: 10
            text: "Green dot = you. Map fills screen; no blink after tiles load."
        }
    }
}