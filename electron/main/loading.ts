import * as fs from 'fs';
import * as nodePath from 'path';

const loadView = ({ title }) => {
  let logoSvg = '';
  try {
    const publicPath = process.env.VITE_DEV_SERVER_URL
      ? nodePath.join(__dirname, '../../public')
      : nodePath.join(__dirname, '../../dist');
    logoSvg = fs.readFileSync(nodePath.join(publicPath, 'favicon.svg'), 'utf-8');
    // Modify width and height of the SVG to fit the splash screen
    logoSvg = logoSvg.replace(/width="\d+"/i, 'width="120"').replace(/height="\d+"/i, 'height="120"');
  } catch (e) {
    console.error("Could not load favicon.svg", e);
  }

  return (`
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>

<body>
    <style>
        body {
            background-color: #141414;
            color: #ffffff;
            margin: 0;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        }

        #loading-mask {
            position: fixed;
            left: 0;
            top: 0;
            height: 100%;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #141414 0%, #1a1a1a 100%);
            user-select: none;
            z-index: 9999;
        }

        .logo-container {
            position: relative;
            margin-bottom: 40px;
            animation: float 6s ease-in-out infinite;
        }

        .logo-glow {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            height: 100px;
            background: radial-gradient(circle, rgba(24,144,255,0.4) 0%, rgba(0,0,0,0) 70%);
            filter: blur(20px);
            z-index: 0;
            animation: pulse-glow 3s ease-in-out infinite;
        }

        .logo {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 120px;
            height: 120px;
        }

        .loader-container {
            width: 200px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }

        .progress-value {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 30%;
            background: linear-gradient(90deg, #1890ff, #52c41a, #1890ff);
            background-size: 200% 100%;
            border-radius: 4px;
            animation: loading 2s infinite linear, shimmer 2s infinite linear;
        }

        .title {
            margin-top: 24px;
            font-size: 14px;
            font-weight: 500;
            letter-spacing: 3px;
            color: rgba(255, 255, 255, 0.6);
            text-transform: uppercase;
            animation: pulse-text 2s infinite ease-in-out;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }

        @keyframes pulse-glow {
            0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
        }

        @keyframes pulse-text {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.9; }
        }

        @keyframes loading {
            0% { left: -30%; width: 30%; }
            50% { left: 30%; width: 70%; }
            100% { left: 100%; width: 30%; }
        }

        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
    </style>

    <div id="loading-mask">
        <div class="logo-container">
            <div class="logo-glow"></div>
            <div class="logo">
                ${logoSvg}
            </div>
        </div>
        <div class="loader-container">
            <div class="progress-bar">
                <div class="progress-value"></div>
            </div>
            <div class="title">${title}</div>
        </div>
    </div>
</body>
</html>
  `)
}

// Ensure the loadingHtml is exported dynamically if needed, but since it's evaluated at import,
// we will export a getter or just evaluate it. Wait, the original was evaluating it directly.
const loadingHtml = 'data:text/html;charset=UTF-8,' + encodeURIComponent(loadView({
  title: "BucketView",
}));
export default loadingHtml
