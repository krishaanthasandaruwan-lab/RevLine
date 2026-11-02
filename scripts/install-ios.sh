#!/bin/zsh
set -euo pipefail
if [[ $# -ne 1 ]]; then
    print 'Usage: scripts/install-ios.sh <paired-iPhone-identifier>'
    exit 1
fi
revline_root="$(cd "$(dirname "$0")/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
xcodebuild -project "$revline_root/ios/RevLine.xcodeproj" -scheme RevLine \
    -configuration Debug -destination "id=$1" -derivedDataPath "$revline_root/ios/build" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device "$1" "$revline_root/ios/build/Build/Products/Debug-iphoneos/RevLine.app"
xcrun devicectl device process launch --device "$1" --terminate-existing com.krishansandaruwan.revline
