# Glowing Back Feature - Implementation Summary

## What Was Added

I added a **glowing back indicator** that changes color based on posture quality by comparing the two sensors (neck vs lower back).

## Changes Made to ContentView.swift

### 1. Posture Detection Logic (Lines ~24-27)
```swift
private var isGoodPosture: Bool {
    let angleDifference = abs(postureVM.upperPitch - postureVM.lowerPitch)
    return angleDifference <= 15.0  // Good if within 15 degrees
}
```

**How it works:**
- Compares the pitch angle from sensor 1 (neck/upper) with sensor 2 (lower back)
- If the difference is **≤ 15°** → **GREEN** (good posture)
- If the difference is **> 15°** → **RED** (bad posture)

### 2. Pass Posture State to 3D Scene (Line ~105)
Added `isGoodPosture` parameter to `TorsoSceneView`

### 3. Update Glow Color in Real-Time (Lines ~215-224)
```swift
// Update back glow color based on posture
if let backGlow = uiView.scene?.rootNode.childNode(withName: "backGlow", recursively: true),
   let glowMaterial = backGlow.geometry?.materials.first {
    let targetColor = isGoodPosture ? UIColor.green : UIColor.red
    
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0.5
    glowMaterial.emission.contents = targetColor
    SCNTransaction.commit()
}
```

### 4. Create Glowing Back Node (Lines ~291-293)
Added the back glow to the 3D model

### 5. Back Glow Geometry Function (Lines ~590-612)
```swift
func createBackGlow() -> SCNNode {
    let backGlowNode = SCNNode()
    backGlowNode.name = "backGlow"
    
    // Glowing box behind upper back
    let glowGeometry = SCNBox(width: 1.0, height: 1.5, length: 0.08, chamferRadius: 0.12)
    
    let glowMaterial = SCNMaterial()
    glowMaterial.emission.contents = UIColor.green
    glowMaterial.diffuse.contents = UIColor.clear
    glowMaterial.lightingModel = .constant
    glowMaterial.transparency = 0.9
    
    glowGeometry.materials = [glowMaterial]
    backGlowNode.geometry = glowGeometry
    
    // Position behind upper back
    backGlowNode.position = SCNVector3(0, 0.5, -0.22)
    
    return backGlowNode
}
```

## How to Use

1. **Make sure backend is running:**
   ```bash
   cd backend
   node server.js
   ```

2. **Connect both Arduinos:**
   ```bash
   # Terminal 2 - Upper sensor (neck)
   node serial-bridge.js /dev/tty.usbmodem1101 115200 localhost 8080 /imu
   
   # Terminal 3 - Lower sensor (back)
   node serial-bridge.js /dev/tty.usbmodem101 115200 localhost 8080 /imu2
   ```

3. **Run the Swift app:**
   - Open `UpperTorso3D.swiftpm` in Xcode
   - Press `Cmd+R` to run
   - Select "My Mac" as target

4. **See the glow:**
   - Rotate the 3D view to see the **back** of the torso
   - The back will have a glowing rectangle:
     - 🟢 **GREEN** = Good posture (sensors aligned)
     - 🔴 **RED** = Bad posture (sensors at different angles)

## Customization

### Adjust Sensitivity
Change the threshold in `ContentView.swift`:
```swift
return angleDifference <= 15.0  // Make smaller = more strict
```

### Change Glow Size/Position
Edit `createBackGlow()` function:
```swift
let glowGeometry = SCNBox(width: 1.0, height: 1.5, ...)  // Adjust size
backGlowNode.position = SCNVector3(0, 0.5, -0.22)  // Adjust position
```

### Change Colors
```swift
let targetColor = isGoodPosture ? UIColor.green : UIColor.red
// Try: UIColor.blue, UIColor.orange, etc.
```

## Testing

### Current Data (from your backend):
- Upper sensor (source 1): ~29° pitch
- Lower sensor (source 2): Should be receiving data
- Difference: Calculate in real-time

### To Test:
1. **Good posture:** Keep both sensors at similar angles → GREEN
2. **Bad posture:** Tilt upper sensor forward (neck crane) → RED
3. **Slouching:** Upper sensor tilts more than lower → RED

## What Wasn't Changed

✅ All your friend's code remains intact:
- `PostureViewModel.swift` - unchanged
- `TelemetryWebSocket.swift` - unchanged  
- `TelemetryMessage.swift` - unchanged
- All existing 3D torso code - unchanged
- Sensor data handling - unchanged

Only **added** the glowing back feature on top of existing code!
