# Privacy Policy for GuideRail

*Last updated: September 17, 2026*

GuideRail is an open-source, local-first browser extension designed to help users clip and organize ChatGPT conversation replies and reference images as local Markdown notes.

### 1. Data Collection and Storage
- **Zero Cloud Storage / No Remote Servers**: GuideRail does NOT operate any external servers, cloud databases, user tracking systems, or telemetry services.
- **Local-Only Storage**: All clipped text content, Markdown notes, timestamps, conversation references, and downloaded images are saved exclusively to your local storage (either a local directory authorized via the browser's File System Access API or your local Obsidian Vault via the GuideRail Companion plugin).
- **No Account Required**: You do not need to create an account, register, or provide an email address to use GuideRail.

### 2. Website Content Access and Permissions
- **ChatGPT Pages (`https://chatgpt.com/*`)**: GuideRail injects a content script solely to identify rendered assistant replies and place a "Bookmark" button. It only reads conversation text and images **after** you explicitly click the Bookmark button.
- **Image Downloads (`https://images.openai.com/*`, `https://*.oaiusercontent.com/*`)**: When you bookmark a reply that contains OpenAI/ChatGPT-generated images or diagrams, GuideRail downloads the image files directly to your local attachment directory to ensure your Markdown notes work completely offline. These requests do not transmit personal credentials.
- **Local Loopback Communication (`http://127.0.0.1:*`)**: If you choose to pair GuideRail with the desktop Obsidian Companion plugin, GuideRail communicates exclusively with `127.0.0.1` (localhost loopback) using a cryptographically random, one-time pairing token. No data is broadcast across local networks or the internet.

### 3. Third-Party Sharing
- GuideRail does NOT sell, rent, monetize, or transfer your data to any third party, advertising network, data broker, or AI training pipeline.

### 4. User Rights and Data Deletion
- Because all notes and images reside entirely on your local machine, you have full ownership and control over your data.
- You can view, edit, move, or delete your saved notes at any time using your file explorer or Obsidian.
- Uninstalling the extension leaves your local files intact on your disk.

### 5. Open Source Transparency
- GuideRail's source code is public and verifiable under the MIT license.

### 6. Contact
If you have any questions or feedback regarding this Privacy Policy, please open an issue on the project's repository.
