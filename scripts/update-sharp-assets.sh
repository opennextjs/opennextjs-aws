#!/usr/bin/env bash

# generate random folder in /tmp
tmpFolder=$(mktemp -d -t update-sharp-assets-XXXXXXXXXX)
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

echo "tmpFolder: $tmpFolder"
echo "openNextFolder: $SCRIPT_DIR"

#create package.json in tmp folder
cat > $tmpFolder/package.json <<EOF
{
  "name": "sharp",
  "version": "1.0.0"
}
EOF

# install sharp in tmp folder using linux arm64
cd $tmpFolder
npm install --arch=arm64 sharp

# move lock file to node_modules
mv $tmpFolder/package-lock.json $tmpFolder/node_modules/.package-lock.json

# remove current sharp-node-modules
rm -rf $SCRIPT_DIR/../packages/open-next/assets/sharp-node-modules

#move node_modules to sharp-node-modules
mv $tmpFolder/node_modules $SCRIPT_DIR/../packages/open-next/assets/sharp-node-modules

