// swift-tools-version: 5.9

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "UpperTorso3D",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "UpperTorso3D",
            targets: ["AppModule"],
            bundleIdentifier: "com.example.UpperTorso3D",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .heart),
            accentColor: .presetColor(.cyan),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: ".",
            resources: [
                .copy("human_anatomy_male_torso.usdz")
            ]
        )
    ]
)
