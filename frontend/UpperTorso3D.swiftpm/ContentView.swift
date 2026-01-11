import SwiftUI
import SceneKit


struct ContentView: View {
    @StateObject private var postureVM = PostureViewModel()
    // Sensor-driven model posture
    @State private var sensorPitch: Float = 0  // Base pitch from sensor
    @State private var sensorRoll: Float = 0   // Base roll from sensor
    
    // User gesture-driven model rotation (for 360 viewing)
    @State private var dragRotationX: Float = 0  // Vertical drag offset
    @State private var dragRotationY: Float = 0  // Horizontal drag offset

    @State private var zoom: CGFloat = 1.0
    @State private var lastDragValue: CGSize = .zero
    
    // Final rotation values (combined sensor + drag)
    private var modelRotationX: Float { sensorPitch + dragRotationX }
    private var modelRotationY: Float { dragRotationY }
    private var modelRotationZ: Float { sensorRoll }
    
    var body: some View {
        mainContent
            .onAppear(perform: handleAppear)
            .onDisappear(perform: handleDisappear)
            .onChange(of: postureVM.upperPitch, perform: handlePitchChange)
            .onChange(of: postureVM.upperRoll, perform: handleRollChange)
    }
    
    private func handleAppear() {
        postureVM.start()
    }
    
    private func handleDisappear() {
        postureVM.stop()
    }
    
    private func handlePitchChange(_ pitch: Double) {
        sensorPitch = Float(pitch * .pi / 180)
    }
    
    private func handleRollChange(_ roll: Double) {
        sensorRoll = Float(roll * .pi / 180)
    }
    
    private var mainContent: some View {
        ZStack {
            // Neutral gray background
            Color(red: 0.55, green: 0.55, blue: 0.55)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                headerView
                sceneView
                controlsView
                InsightCard()
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
            }
        }
    }
    
    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("PRESSUREPOINT")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.8))
                    .tracking(4)
                Text("Welcome!")
                    .font(.system(size: 28, weight: .thin))
                    .foregroundColor(.white)
            }
            Spacer()
            
            // Reset button
            Button(action: {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                    dragRotationX = 0  // Reset drag rotations
                    dragRotationY = 0
                    zoom = 1.0
                }
            }) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.15))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 20)
        .padding(.bottom, 10)
    }
    
    private var sceneView: some View {
        TorsoSceneView(
            modelRotationX: modelRotationX,
            modelRotationY: modelRotationY,
            modelRotationZ: modelRotationZ,
            zoom: $zoom
        )
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .padding(.horizontal, 16)
        .gesture(
            DragGesture()
                .onChanged { value in
                    // Horizontal drag rotates model around Y axis (360 spin)
                    let dx = Float(value.translation.width - lastDragValue.width) * 0.01
                    // Vertical drag rotates model around X axis (tilt up/down)
                    let dy = Float(value.translation.height - lastDragValue.height) * 0.01
                    dragRotationY += dx
                    dragRotationX += dy
                    lastDragValue = value.translation
                }
                .onEnded { _ in
                    lastDragValue = .zero
                }
        )
        .gesture(
            MagnificationGesture()
                .onChanged { value in
                    zoom = min(max(value, 0.5), 2.5)
                }
        )
    }
    
    private var controlsView: some View {
        VStack(spacing: 16) {
            // Zoom slider
            HStack(spacing: 16) {
                Image(systemName: "minus.magnifyingglass")
                    .foregroundColor(.white.opacity(0.6))
                
                Slider(value: $zoom, in: 0.5...2.5)
                    .tint(.white)
                
                Image(systemName: "plus.magnifyingglass")
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding(.horizontal, 24)
            
            // Instructions
            Text("Drag to rotate • Pinch to zoom")
                .font(.system(size: 13, weight: .light, design: .rounded))
                .foregroundColor(.white.opacity(0.5))
        }
        .padding(.vertical, 16)
    }
}

// MARK: - Insight Card
struct InsightCard: View {
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lightbulb.fill")
                .font(.system(size: 16))
                .foregroundColor(.gray)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("INSIGHT")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(.gray)
                    .tracking(1)
                
                Text("Keep your shoulders back and aligned. Take a moment to straighten your spine and relax your neck.")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(.black.opacity(0.85))
                    .lineSpacing(3)
            }
            
            Spacer()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(red: 0.94, green: 0.94, blue: 0.96))
        )
    }
}

// MARK: - 3D Scene View
struct TorsoSceneView: UIViewRepresentable {
    var modelRotationX: Float  // Pitch (sensor + drag)
    var modelRotationY: Float  // Yaw (drag)
    var modelRotationZ: Float  // Roll (sensor)
    @Binding var zoom: CGFloat
    
    func makeUIView(context: Context) -> SCNView {
        let sceneView = SCNView()
        sceneView.scene = createScene()
        sceneView.backgroundColor = UIColor(red: 0.55, green: 0.55, blue: 0.55, alpha: 1.0)
        sceneView.antialiasingMode = .multisampling4X
        sceneView.autoenablesDefaultLighting = false
        sceneView.allowsCameraControl = false
        
        return sceneView
    }
    
    func updateUIView(_ uiView: SCNView, context: Context) {
        // Apply all rotations to the model
        if let modelNode = uiView.scene?.rootNode.childNode(withName: "model", recursively: false) {
            modelNode.eulerAngles = SCNVector3(modelRotationX, modelRotationY, modelRotationZ)
        }

        // Camera stays fixed, only zoom changes
        if let cameraNode = uiView.scene?.rootNode.childNode(withName: "camera", recursively: false) {
            cameraNode.position.z = Float(2.5 / zoom)
        }
    }
    
    func createScene() -> SCNScene {
        let scene = SCNScene()
        
        // Camera
        let cameraNode = SCNNode()
        cameraNode.name = "camera"
        cameraNode.camera = SCNCamera()
        cameraNode.camera?.fieldOfView = 50
        cameraNode.position = SCNVector3(0, 0.8, 2.5)
        scene.rootNode.addChildNode(cameraNode)
        
        // Studio lighting
        let keyLight = SCNNode()
        keyLight.light = SCNLight()
        keyLight.light?.type = .directional
        keyLight.light?.intensity = 800
        keyLight.light?.color = UIColor.white
        keyLight.eulerAngles = SCNVector3(-Float.pi / 4, Float.pi / 6, 0)
        scene.rootNode.addChildNode(keyLight)
        
        let fillLight = SCNNode()
        fillLight.light = SCNLight()
        fillLight.light?.type = .directional
        fillLight.light?.intensity = 500
        fillLight.light?.color = UIColor.white
        fillLight.eulerAngles = SCNVector3(-Float.pi / 6, -Float.pi / 4, 0)
        scene.rootNode.addChildNode(fillLight)
        
        let backLight = SCNNode()
        backLight.light = SCNLight()
        backLight.light?.type = .directional
        backLight.light?.intensity = 400
        backLight.light?.color = UIColor.white
        backLight.eulerAngles = SCNVector3(0, Float.pi, 0)
        scene.rootNode.addChildNode(backLight)
        
        let ambientLight = SCNNode()
        ambientLight.light = SCNLight()
        ambientLight.light?.type = .ambient
        ambientLight.light?.intensity = 500
        ambientLight.light?.color = UIColor(white: 0.9, alpha: 1.0)
        scene.rootNode.addChildNode(ambientLight)
        
        // Container node for the model
        let modelNode = SCNNode()
        modelNode.name = "model"
        
        // Load the USDZ model or use fallback
        if let loadedModel = loadUSDZModel() {
            modelNode.addChildNode(loadedModel)
        } else {
            // Use built-in torso if USDZ not found
            let fallback = createBuiltInTorso()
            modelNode.addChildNode(fallback)
        }
        
        scene.rootNode.addChildNode(modelNode)
        
        return scene
    }
    
    func loadUSDZModel() -> SCNNode? {
        var fileURL: URL?
        
        // Method 1: Try Bundle.main.url
        if let bundleURL = Bundle.main.url(forResource: "human_anatomy_male_torso", withExtension: "usdz") {
            fileURL = bundleURL
            print("Found via Bundle.main.url: \(bundleURL)")
        }
        
        // Method 2: Try Bundle.main.path
        if fileURL == nil, let path = Bundle.main.path(forResource: "human_anatomy_male_torso", ofType: "usdz") {
            fileURL = URL(fileURLWithPath: path)
            print("Found via Bundle.main.path: \(path)")
        }
        
        // Method 3: Search in bundle resource path
        if fileURL == nil, let resourcePath = Bundle.main.resourcePath {
            let possiblePath = (resourcePath as NSString).appendingPathComponent("human_anatomy_male_torso.usdz")
            if FileManager.default.fileExists(atPath: possiblePath) {
                fileURL = URL(fileURLWithPath: possiblePath)
                print("Found in resourcePath: \(possiblePath)")
            }
        }
        
        // Method 4: Search bundle URL directly
        if fileURL == nil {
            let bundleContents = Bundle.main.bundleURL.appendingPathComponent("human_anatomy_male_torso.usdz")
            if FileManager.default.fileExists(atPath: bundleContents.path) {
                fileURL = bundleContents
                print("Found in bundleURL: \(bundleContents)")
            }
        }
        
        // Debug: Print what's in the bundle
        if fileURL == nil {
            print("USDZ NOT FOUND. Bundle contents:")
            if let resourcePath = Bundle.main.resourcePath {
                do {
                    let contents = try FileManager.default.contentsOfDirectory(atPath: resourcePath)
                    for item in contents {
                        print("  - \(item)")
                    }
                } catch {
                    print("  Error listing: \(error)")
                }
            }
            return nil
        }
        
        guard let url = fileURL else { return nil }
        
        do {
            let loadedScene = try SCNScene(url: url, options: [
                .checkConsistency: true
            ])
            
            let containerNode = SCNNode()
            for child in loadedScene.rootNode.childNodes {
                containerNode.addChildNode(child.clone())
            }
            
            // Center and scale the model
            let (minVec, maxVec) = containerNode.boundingBox
            let width = maxVec.x - minVec.x
            let height = maxVec.y - minVec.y
            let depth = maxVec.z - minVec.z
            let maxDimension = max(width, max(height, depth))
            
            let targetSize: Float = 1.5
            let scale = targetSize / maxDimension
            containerNode.scale = SCNVector3(scale, scale, scale)
            
            let centerX = (minVec.x + maxVec.x) / 2 * scale
            let centerY = (minVec.y + maxVec.y) / 2 * scale
            let centerZ = (minVec.z + maxVec.z) / 2 * scale
            containerNode.position = SCNVector3(-centerX, -centerY, -centerZ)
            
            return containerNode
        } catch {
            print("Failed to load USDZ: \(error)")
            return nil
        }
    }
    
    // Built-in smooth torso model
    func createBuiltInTorso() -> SCNNode {
        let torsoNode = SCNNode()
        
        let skinMaterial = SCNMaterial()
        skinMaterial.diffuse.contents = UIColor(red: 0.82, green: 0.78, blue: 0.75, alpha: 1.0)
        skinMaterial.specular.contents = UIColor(white: 0.15, alpha: 1.0)
        skinMaterial.roughness.contents = 0.75
        skinMaterial.metalness.contents = 0.0
        skinMaterial.lightingModel = .physicallyBased
        
        // Head
        let head = SCNSphere(radius: 0.22)
        head.segmentCount = 64
        head.materials = [skinMaterial]
        let headNode = SCNNode(geometry: head)
        headNode.position = SCNVector3(0, 1.1, 0)
        headNode.scale = SCNVector3(0.85, 1.0, 0.88)
        torsoNode.addChildNode(headNode)
        
        // Brow
        let brow = SCNSphere(radius: 0.18)
        brow.segmentCount = 48
        brow.materials = [skinMaterial]
        let browNode = SCNNode(geometry: brow)
        browNode.position = SCNVector3(0, 1.15, 0.08)
        browNode.scale = SCNVector3(0.85, 0.35, 0.4)
        torsoNode.addChildNode(browNode)
        
        // Nose
        let nose = SCNSphere(radius: 0.035)
        nose.segmentCount = 32
        nose.materials = [skinMaterial]
        let noseNode = SCNNode(geometry: nose)
        noseNode.position = SCNVector3(0, 1.02, 0.2)
        torsoNode.addChildNode(noseNode)
        
        // Jaw
        let jaw = SCNSphere(radius: 0.15)
        jaw.segmentCount = 48
        jaw.materials = [skinMaterial]
        let jawNode = SCNNode(geometry: jaw)
        jawNode.position = SCNVector3(0, 0.95, 0.05)
        jawNode.scale = SCNVector3(0.9, 0.55, 0.7)
        torsoNode.addChildNode(jawNode)
        
        // Ears
        for xOffset: Float in [-0.19, 0.19] {
            let ear = SCNCylinder(radius: 0.035, height: 0.07)
            ear.radialSegmentCount = 24
            ear.materials = [skinMaterial]
            let earNode = SCNNode(geometry: ear)
            earNode.position = SCNVector3(xOffset, 1.1, 0)
            earNode.eulerAngles = SCNVector3(0, 0, Float.pi / 2)
            torsoNode.addChildNode(earNode)
        }
        
        // Neck
        let neck = SCNCylinder(radius: 0.08, height: 0.2)
        neck.radialSegmentCount = 32
        neck.materials = [skinMaterial]
        let neckNode = SCNNode(geometry: neck)
        neckNode.position = SCNVector3(0, 0.78, 0)
        torsoNode.addChildNode(neckNode)
        
        // Trapezius
        let trap = SCNSphere(radius: 0.2)
        trap.segmentCount = 48
        trap.materials = [skinMaterial]
        let trapNode = SCNNode(geometry: trap)
        trapNode.position = SCNVector3(0, 0.7, -0.02)
        trapNode.scale = SCNVector3(1.8, 0.4, 0.7)
        torsoNode.addChildNode(trapNode)
        
        // Chest
        let chest = SCNBox(width: 0.6, height: 0.45, length: 0.28, chamferRadius: 0.08)
        chest.materials = [skinMaterial]
        let chestNode = SCNNode(geometry: chest)
        chestNode.position = SCNVector3(0, 0.45, 0)
        torsoNode.addChildNode(chestNode)
        
        // Upper chest
        let upperChest = SCNSphere(radius: 0.28)
        upperChest.segmentCount = 48
        upperChest.materials = [skinMaterial]
        let upperChestNode = SCNNode(geometry: upperChest)
        upperChestNode.position = SCNVector3(0, 0.55, 0.06)
        upperChestNode.scale = SCNVector3(1.1, 0.5, 0.55)
        torsoNode.addChildNode(upperChestNode)
        
        // Pecs
        for xOffset: Float in [-0.12, 0.12] {
            let pec = SCNSphere(radius: 0.14)
            pec.segmentCount = 48
            pec.materials = [skinMaterial]
            let pecNode = SCNNode(geometry: pec)
            pecNode.position = SCNVector3(xOffset, 0.48, 0.1)
            pecNode.scale = SCNVector3(1.0, 0.65, 0.45)
            torsoNode.addChildNode(pecNode)
        }
        
        // Abdomen
        let abdomen = SCNBox(width: 0.42, height: 0.35, length: 0.22, chamferRadius: 0.06)
        abdomen.materials = [skinMaterial]
        let abdomenNode = SCNNode(geometry: abdomen)
        abdomenNode.position = SCNVector3(0, 0.1, 0.02)
        torsoNode.addChildNode(abdomenNode)
        
        // Waist
        let waist = SCNSphere(radius: 0.22)
        waist.segmentCount = 48
        waist.materials = [skinMaterial]
        let waistNode = SCNNode(geometry: waist)
        waistNode.position = SCNVector3(0, -0.1, 0)
        waistNode.scale = SCNVector3(1.0, 0.4, 0.6)
        torsoNode.addChildNode(waistNode)
        
        // Obliques
        for xOffset: Float in [-0.22, 0.22] {
            let oblique = SCNSphere(radius: 0.12)
            oblique.segmentCount = 32
            oblique.materials = [skinMaterial]
            let obliqueNode = SCNNode(geometry: oblique)
            obliqueNode.position = SCNVector3(xOffset, 0.15, 0)
            obliqueNode.scale = SCNVector3(0.6, 1.3, 0.6)
            torsoNode.addChildNode(obliqueNode)
        }
        
        // Arms
        for side: Float in [-1, 1] {
            let armAngle: Float = side * 0.35
            
            // Shoulder
            let shoulder = SCNSphere(radius: 0.1)
            shoulder.segmentCount = 48
            shoulder.materials = [skinMaterial]
            let shoulderNode = SCNNode(geometry: shoulder)
            shoulderNode.position = SCNVector3(side * 0.35, 0.55, 0)
            torsoNode.addChildNode(shoulderNode)
            
            // Upper arm
            let upperArm = SCNCapsule(capRadius: 0.065, height: 0.35)
            upperArm.capSegmentCount = 24
            upperArm.radialSegmentCount = 32
            upperArm.materials = [skinMaterial]
            let upperArmNode = SCNNode(geometry: upperArm)
            upperArmNode.position = SCNVector3(side * 0.52, 0.4, 0)
            upperArmNode.eulerAngles = SCNVector3(0, 0, armAngle)
            torsoNode.addChildNode(upperArmNode)
            
            // Elbow
            let elbow = SCNSphere(radius: 0.06)
            elbow.segmentCount = 32
            elbow.materials = [skinMaterial]
            let elbowNode = SCNNode(geometry: elbow)
            elbowNode.position = SCNVector3(side * 0.68, 0.22, 0)
            torsoNode.addChildNode(elbowNode)
            
            // Forearm
            let forearm = SCNCapsule(capRadius: 0.05, height: 0.32)
            forearm.capSegmentCount = 24
            forearm.radialSegmentCount = 32
            forearm.materials = [skinMaterial]
            let forearmNode = SCNNode(geometry: forearm)
            forearmNode.position = SCNVector3(side * 0.82, 0.04, 0)
            forearmNode.eulerAngles = SCNVector3(0, 0, armAngle * 0.7)
            torsoNode.addChildNode(forearmNode)
            
            // Wrist
            let wrist = SCNCylinder(radius: 0.032, height: 0.06)
            wrist.radialSegmentCount = 24
            wrist.materials = [skinMaterial]
            let wristNode = SCNNode(geometry: wrist)
            wristNode.position = SCNVector3(side * 0.94, -0.12, 0)
            wristNode.eulerAngles = SCNVector3(0, 0, armAngle * 0.5)
            torsoNode.addChildNode(wristNode)
            
            // Hand
            let hand = SCNBox(width: 0.07, height: 0.1, length: 0.03, chamferRadius: 0.01)
            hand.materials = [skinMaterial]
            let handNode = SCNNode(geometry: hand)
            handNode.position = SCNVector3(side * 1.0, -0.22, 0)
            handNode.eulerAngles = SCNVector3(0, 0, armAngle * 0.3)
            torsoNode.addChildNode(handNode)
            
            // Fingers
            for i in 0..<4 {
                let finger = SCNCapsule(capRadius: 0.008, height: 0.06)
                finger.materials = [skinMaterial]
                let fingerNode = SCNNode(geometry: finger)
                let xOff = CGFloat(-0.022 + Double(i) * 0.015)
                fingerNode.position = SCNVector3(side * 1.0 + Float(xOff) * side, -0.3, 0)
                torsoNode.addChildNode(fingerNode)
            }
            
            // Thumb
            let thumb = SCNCapsule(capRadius: 0.01, height: 0.04)
            thumb.materials = [skinMaterial]
            let thumbNode = SCNNode(geometry: thumb)
            thumbNode.position = SCNVector3(side * 0.96, -0.24, 0.015)
            thumbNode.eulerAngles = SCNVector3(0.2, 0, side * -0.5)
            torsoNode.addChildNode(thumbNode)
        }
        
        return torsoNode
    }
}
