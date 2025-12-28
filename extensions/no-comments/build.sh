
#!/bin/bash

# GitHub Comment Remover Extension Build Script

echo "Building GitHub Comment Remover Extension..."

# Create dist directory
mkdir -p dist

# Copy all files to dist
cp manifest.json dist/
cp src/content/content.js dist/
cp src/popup/popup.html dist/
cp src/popup/popup.js dist/
cp src/background/background.js dist/
cp src/styles/styles.css dist/

# Create icons directory and add a simple icon
mkdir -p dist/icons

# Create a simple SVG icon for the extension
cat > dist/icons/icon.svg << 'EOF'
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#0366d6" rx="16"/>
    <path d="M32 40h64v8H32v-8zm0 16h48v8H32v-8zm0 16h56v8H32v-8zm0 16h40v8H32v-8z" fill="white"/>
      <path d="M88 56l8 8-8 8v-16z" fill="white"/>
      </svg>
      EOF

      # Convert SVG to different sizes (requires imagemagick)
      if command -v convert &> /dev/null; then
          echo "Converting icon to different sizes..."
              convert dist/icons/icon.svg -resize 16x16 dist/icons/icon-16.png
                  convert dist/icons/icon.svg -resize 32x32 dist/icons/icon-32.png
                      convert dist/icons/icon.svg -resize 48x48 dist/icons/icon-48.png
                          convert dist/icons/icon.svg -resize 128x128 dist/icons/icon-128.png

                                  # Update manifest to include icons
                                      cat > dist/manifest.json << 'EOF'
                                      {
                                        "manifest_version": 2,
                                          "name": "GitHub Comment Remover",
                                            "version": "1.0",
                                              "description": "Removes comments from TypeScript and Rust code on GitHub for cleaner reading",

                                                  "icons": {
                                                      "16": "icons/icon-16.png",
                                                          "32": "icons/icon-32.png",
                                                              "48": "icons/icon-48.png",
                                                                  "128": "icons/icon-128.png"
                                                              },

                                                                        "permissions": [
                                                                            "activeTab",
                                                                                "storage",
                                                                                    "https://github.com/*"
                                                                                      ],

                                                                                          "content_scripts": [
                                                                                              {
                                                                                                    "matches": ["https://github.com/*"],
                                                                                                          "js": ["content.js"],
                                                                                                                "css": ["styles.css"],
                                                                                                                      "run_at": "document_end"
                                                                                                                  }
                                                                                                                            ],

                                                                                                                                "browser_action": {
                                                                                                                                    "default_popup": "popup.html",
                                                                                                                                        "default_title": "Toggle comment removal",
                                                                                                                                            "default_icon": {
                                                                                                                                                  "16": "icons/icon-16.png",
                                                                                                                                                        "32": "icons/icon-32.png"
                                                                                                                                                    }
                                                                                                                                            },

                                                                                                                                                                  "background": {
                                                                                                                                                                      "scripts": ["background.js"],
                                                                                                                                                                          "persistent": false
                                                                                                                                                                      }
                                                                                                                                                              }
                                                                                                                                                                    EOF
                                                                                                                                                                else
                                                                                                                                                                    echo "ImageMagick not found. Using basic manifest without icons."
      fi

      # Create package.json for development
      cat > dist/package.json << 'EOF'
      {
        "name": "github-comment-remover",
          "version": "1.0.0",
            "description": "Firefox extension to remove comments from TypeScript and Rust code on GitHub",
              "scripts": {
                  "dev": "web-ext run --source-dir=. --target=firefox-desktop",
                      "build": "web-ext build --source-dir=. --artifacts-dir=../artifacts",
                          "lint": "web-ext lint --source-dir=."
                      },
                              "devDependencies": {
                                  "web-ext": "^7.0.0"
                              }
                      }
                            EOF

                            # Create README
                            cat > dist/README.md << 'EOF'
                            # GitHub Comment Remover

                            A Firefox extension that removes comments from TypeScript and Rust code on GitHub for cleaner reading.

                            ## Features

                            - Automatically detects and processes TypeScript (.ts, .tsx), JavaScript (.js, .jsx), and Rust (.rs) files
                            - Removes single-line comments (`//`), multi-line comments (`/* */`), and doc comments
                            - Toggle comments on/off with a simple popup interface
                            - Works seamlessly with GitHub's single-page app navigation
                            - Clean, modern UI with Tailwind CSS styling

                            ## Installation

                            ### From Source
                            1. Clone or download this repository
                            2. Open Firefox and navigate to `about:debugging`
                            3. Click "This Firefox" → "Load Temporary Add-on"
                            4. Select the `manifest.json` file
                            5. The extension will be loaded and ready to use

                            ### Development
                            1. Install web-ext: `npm install -g web-ext`
                            2. Run in development mode: `npm run dev`
                            3. Build for distribution: `npm run build`

                            ## Usage

                            1. Navigate to any TypeScript or Rust file on GitHub
                            2. Comments will be automatically removed for cleaner reading
                            3. Click the extension icon to toggle comment visibility
                            4. Use the popup interface to control the extension

                            ## Supported File Types

                            - TypeScript: `.ts`, `.tsx`
                            - JavaScript: `.js`, `.jsx`
                            - Rust: `.rs`

                            ## Development

                            The extension consists of:
                            - `manifest.json` - Extension configuration
                            - `content.js` - Main comment removal logic
                            - `popup.html/js` - User interface
                            - `background.js` - Background processes
                            - `styles.css` - Custom styling

                            ## License

                            MIT License
                            EOF

                            # Create zip file for distribution
                            if command -v zip &> /dev/null; then
                                echo "Creating distribution zip..."
                                    cd dist
                                        zip -r ../github-comment-remover-v1.0.zip . -x "*.DS_Store" "package.json" "README.md"
                                            cd ..
                                                echo "Distribution zip created: github-comment-remover-v1.0.zip"
                            fi

                            echo "Build complete! Extension files are in the 'dist' directory."
                            echo ""
                            echo "To install:"
                            echo "1. Open Firefox and go to about:debugging"
                            echo "2. Click 'This Firefox' → 'Load Temporary Add-on'"
                            echo "3. Select dist/manifest.json"
                            echo ""
                            echo "To develop:"
                            echo "1. cd dist && npm install"
                            echo "2. npm run dev"
