require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const util = require('util');
const fs = require("fs");
const path = require("path");
const app = express();

const username = process.env.USER.toLowerCase(); 
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");
const scriptPath = path.join(process.env.HOME, "serv00-play", "singbox", "start.sh");
const configFilePath = path.join(__dirname, 'config.json');
const SINGBOX_CONFIG_PATH = path.join(process.env.HOME, "serv00-play", "singbox", "singbox.json");
const CONFIG_PATH = path.join(process.env.HOME, "serv00-play", "singbox", "config.json");

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let logs = [];
let latestStartLog = "";
function logMessage(message) {
    logs.push(message);
    if (logs.length > 5) logs.shift();
}

function executeCommand(command, actionName, isStartLog = false) {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            const timestamp = new Date().toLocaleString();
            if (err) {
                logMessage(`${actionName} 执行失败: ${err.message}`);
                reject(err.message);  
                return;
            }
            if (stderr) {
                logMessage(`${actionName} 执行标准错误输出: ${stderr}`);
            }
            const successMsg = `${actionName} 执行成功:\n${stdout}`;
            logMessage(successMsg);
            if (isStartLog) latestStartLog = successMsg;
            resolve(stdout);  
        });
    });
}

function stopShellCommand() {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash killsing-box.sh`;
    executeCommand(command, "killsing-box.sh", true);  
}

function runShellCommand() {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash start.sh`;
    executeCommand(command, "start.sh", true);
}

async function KeepAlive() {
    console.log("KeepAlive 被调用");
    const command = `cd ${process.env.HOME}/serv00-play/ && bash keepalive.sh`;
    try {
        const result = await executeCommand(command, "keepalive.sh", true);
        console.log("KeepAlive 执行结果:", result);
    } catch (err) {
        console.error("KeepAlive 失败:", err);
    }
}

setInterval(KeepAlive, 20000);

function executeCommand(command, actionName, isStartLog = false, callback) {
    exec(command, (err, stdout, stderr) => {
        const timestamp = new Date().toLocaleString();
        if (err) {
            logMessage(`${actionName} 执行失败: ${err.message}`);
            if (callback) callback(err.message);
            return;
        }
        if (stderr) {
            logMessage(`${actionName} 执行标准错误输出: ${stderr}`);
        }
        const successMsg = `${actionName} 执行成功:\n${stdout}`;
        logMessage(successMsg);
        if (isStartLog) latestStartLog = successMsg;
        if (callback) callback(stdout);
    });
}

function runShellCommand(callback) {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash start.sh`;
    executeCommand(command, "start.sh", true, callback);
}

function stopShellCommand(callback) {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash killsing-box.sh`;
    executeCommand(command, "killsing-box.sh", true, callback);
}

function KeepAlive(callback) {
    const command = `cd ${process.env.HOME}/serv00-play/ && bash keepalive.sh`;
    executeCommand(command, "keepalive.sh", true, callback);
}

app.get("/info", (req, res) => {
    runShellCommand((runResult) => {
        KeepAlive((keepAliveResult) => {
            res.sendFile(path.join(__dirname, "public", "info.html"));
        });
    });
});

app.use(express.urlencoded({ extended: true }));
function executeHy2ipScript(logMessages, callback) {
    const downloadCommand = "curl -Ls https://raw.githubusercontent.com/ryty1/serv00-save-me/refs/heads/main/single/hy2ip.sh -o /tmp/hy2ip.sh";
    exec(downloadCommand, (error, stdout, stderr) => {
        if (error) {
            return callback(error, "", stderr);
        }
        const executeCommand = "bash /tmp/hy2ip.sh";
        exec(executeCommand, (error, stdout, stderr) => {
            exec("rm -f /tmp/hy2ip.sh", (err) => {
                if (err) {
                    console.error(`❌ 删除临时文件失败: ${err.message}`);
                } else {
                    console.log("✅ 临时文件已删除");
                }
            });

            callback(error, stdout, stderr);
        });
    });
}

app.get("/hy2ip", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "hy2ip.html"));
});

app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.json({ success: false, errorMessage: "输入错误！请返回并输入“更新”以确认。" });
    }

    try {
        let logMessages = [];

        executeHy2ipScript(logMessages, (error, stdout, stderr) => {
            let updatedIp = "";

            if (stdout) {
                let outputMessages = stdout.split("\n");
                outputMessages.forEach(line => {
                    if (line.includes("SingBox 配置文件成功更新IP为")) {
                        updatedIp = line.split("SingBox 配置文件成功更新IP为")[1].trim();
                    }
                    if (line.includes("Config 配置文件成功更新IP为")) {
                        updatedIp = line.split("Config 配置文件成功更新IP为")[1].trim();
                    }
                });
                updatedIp = updatedIp.replace(/\x1B\[[0-9;]*m/g, "");

                if (updatedIp && updatedIp !== "未找到可用的 IP！") {
                    logMessages.push("命令执行成功");
                    logMessages.push(`SingBox 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push(`Config 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push("sing-box 已重启");
                    res.json({ success: true, ip: updatedIp, logs: logMessages });
                } else {
                    logMessages.push("命令执行成功");
                    logMessages.push("没有找到有效 IP");
                    res.json({ success: false, errorMessage: "没有找到有效的 IP", logs: logMessages });
                }
            }
        });
    } catch (error) {
        let logMessages = ["命令执行成功", "没有找到有效 IP"];
        res.json({ success: false, errorMessage: "命令执行失败", logs: logMessages });
    }
});

app.get("/api/log", (req, res) => {
    const command = "ps aux"; 

    exec(command, (err, stdout, stderr) => {
        if (err) {
            return res.json({
                error: true,
                message: `执行错误: ${err.message}`,
                logs: "暂无日志",
                processOutput: ""
            });
        }

        const processOutput = stdout.trim(); 
        const latestLog = logs[logs.length - 1] || "暂无日志";
        
        res.json({
            error: false,
            message: "成功获取数据",
            logs: latestLog,
            processOutput: processOutput
        });
    });
});

app.get("/log", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "log.html"));
});

app.get("/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            res.type("html").send(`<pre>无法读取文件: ${err.message}</pre>`);
            return;
        }

        const cleanedData = data
            .replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/|https:\/\/)/g, '\n$1')
            .trim();

        const vmessPattern = /vmess:\/\/[^\n]+/g;
        const hysteriaPattern = /hysteria2:\/\/[^\n]+/g;
        const httpsPattern = /https:\/\/[^\n]+/g;
        const proxyipPattern = /proxyip:\/\/[^\n]+/g;
        const vmessConfigs = cleanedData.match(vmessPattern) || [];
        const hysteriaConfigs = cleanedData.match(hysteriaPattern) || [];
        const httpsConfigs = cleanedData.match(httpsPattern) || [];
        const proxyipConfigs = cleanedData.match(proxyipPattern) || [];
        const allConfigs = [...vmessConfigs, ...hysteriaConfigs, ...httpsConfigs, ...proxyipConfigs];

        let htmlContent = `
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
                <title>节点信息</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        padding: 10px;
                    }
                    .content-container {
                        width: 90%;
                        max-width: 600px;
                        background-color: #fff;
                        padding: 15px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        text-align: left;
                        box-sizing: border-box;
                    }
                    h3 {
                        font-size: 20px;
                        margin-bottom: 10px;
                        text-align: center;
                    }
                    .config-box {
                        max-height: 65vh;
                        overflow-y: auto;
                        border: 1px solid #ccc;
                        padding: 8px;
                        background-color: #f9f9f9;
                        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.1);
                        border-radius: 5px;
                        white-space: pre-wrap;
                        word-break: break-word;
                        font-size: 14px;
                    }
                    .copy-btn {
                        display: block;
                        width: 100%;
                        padding: 12px;
                        font-size: 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        text-align: center;
                        margin-top: 15px;
                        transition: background-color 0.3s;
                    }
                    .copy-btn:hover {
                        background-color: #0056b3;
                    }
                    @media (max-width: 600px) {
                        .content-container {
                            padding: 12px;
                        }
                        .config-box {
                            font-size: 13px;
                        }
                        .copy-btn {
                            font-size: 15px;
                            padding: 10px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="content-container">
                    <h3>节点信息</h3>
                    <div class="config-box" id="configBox">
        `;

        allConfigs.forEach((config) => {
            htmlContent += `<div>${config.trim()}</div>`; // 去掉首尾空格
        });

        htmlContent += `
                    </div>
                    <button class="copy-btn" onclick="copyToClipboard()">一键复制</button>
                </div>

                <script>
                    function copyToClipboard() {
                        const element = document.getElementById("configBox");
                        let text = Array.from(element.children)
                            .map(child => child.textContent.trim())
                            .join("\\n");

                        navigator.clipboard.writeText(text).then(() => {
                            alert("已复制到剪贴板！");
                        }).catch(() => {
                            alert("复制失败，请手动复制！");
                        });
                    }
                </script>
            </body>
            </html>
        `;
        res.type("html").send(htmlContent);
    });
});

function getConfigFile() {
    console.log('检查配置文件是否存在:', configFilePath);
    
    try {
        if (fs.existsSync(configFilePath)) {
            console.log('配置文件已存在，读取文件内容...');
            return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        } else {
            console.log('配置文件不存在，创建默认配置并写入...');
            const defaultConfig = {
                vmessname: "Argo-vmess",
                hy2name: "Hy2",
                HIDE_USERNAME: false 
            };
            fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig));
            console.log('配置文件已创建:', configFilePath);
            
            writeDefaultConfigToScript(defaultConfig);
            return defaultConfig;
        }
    } catch (error) {
        console.error('读取配置文件时出错:', error);
        return null;
    }
}

function writeDefaultConfigToScript(config) {
    console.log('写入默认配置到脚本:', scriptPath);
    let scriptContent;

    try {
        scriptContent = fs.readFileSync(scriptPath, 'utf8');
    } catch (error) {
        console.error('读取脚本文件时出错:', error);
        return;
    }

    const exportListFuncPattern = /export_list\(\)\s*{\n([\s\S]*?)}/m;
    const match = scriptContent.match(exportListFuncPattern);

    if (match) {
        let exportListContent = match[1];

        if (!exportListContent.includes('custom_vmess')) {
            exportListContent = `  custom_vmess="${config.vmessname}"\n` + exportListContent;
        }
        if (!exportListContent.includes('custom_hy2')) {
            exportListContent = `  custom_hy2="${config.hy2name}"\n` + exportListContent;
        }

        scriptContent = scriptContent.replace(exportListFuncPattern, `export_list() {\n${exportListContent}}`);
    } else {
        console.log("没有找到 export_list() 函数，无法插入变量定义。");
    }

    scriptContent = scriptContent.replaceAll(/vmessname=".*?"/g, `vmessname="\$custom_vmess-\$host-\$user"`);
    scriptContent = scriptContent.replaceAll(/hy2name=".*?"/g, `hy2name="\$custom_hy2-\$host-\$user"`);

    if (config.HIDE_USERNAME) {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami | tail -c 2 | head -c 1)"`);
    } else {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami)"`);
    }

    scriptContent = scriptContent.replace(/\n{2,}/g, '\n').trim();

    try {
        fs.writeFileSync(scriptPath, scriptContent);
        console.log('脚本已更新:', scriptPath);
    } catch (error) {
        console.error('写入脚本文件时出错:', error);
    }
}

async function updateConfigFile(config) {
    console.log('更新配置文件:', configFilePath);
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(config));
        console.log('配置文件更新成功');
    } catch (error) {
        console.error('更新配置文件时出错:', error);
        return;
    }

    console.log('更新脚本内容:', scriptPath);
    let scriptContent;

    try {
        scriptContent = fs.readFileSync(scriptPath, 'utf8');
    } catch (error) {
        console.error('读取脚本文件时出错:', error);
        return;
    }

    scriptContent = scriptContent.replaceAll(/custom_vmess=".*?"/g, `custom_vmess="${config.vmessname}"`);
    scriptContent = scriptContent.replaceAll(/custom_hy2=".*?"/g, `custom_hy2="${config.hy2name}"`);
    scriptContent = scriptContent.replaceAll(/vmessname=".*?"/g, `vmessname="\$custom_vmess-\$host-\$user"`);
    scriptContent = scriptContent.replaceAll(/hy2name=".*?"/g, `hy2name="\$custom_hy2-\$host-\$user"`);

    if (config.HIDE_USERNAME) {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami | tail -c 2 | head -c 1)"`);
    } else {
        scriptContent = scriptContent.replaceAll(/user=".*?"/g, `user="\$(whoami)"`);
    }

    scriptContent = scriptContent.replace(/\n{2,}/g, '\n').trim();

    try {
        fs.writeFileSync(scriptPath, scriptContent);
        console.log('脚本更新成功:', scriptPath);
    } catch (error) {
        console.error('写入脚本文件时出错:', error);
        return;
    }
    stopShellCommand();
    setTimeout(() => {
        runShellCommand();
    }, 3000); 
}

app.get('/api/get-config', (req, res) => {
    const config = getConfigFile();
    res.json(config);
});

app.post('/api/update-config', (req, res) => {
    const { vmessname, hy2name, HIDE_USERNAME } = req.body;
    const newConfig = { vmessname, hy2name, HIDE_USERNAME };

    updateConfigFile(newConfig);

    res.json({ success: true });
});

app.get('/newset', (req, res) => {
    res.sendFile(path.join(__dirname, "public", 'newset.html'));
});

app.get('/getConfig', (req, res) => {
  fs.readFile(SINGBOX_CONFIG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: '读取配置文件失败' });
    }

    try {
      const config = JSON.parse(data);
      res.json({
        GOOD_DOMAIN: config.GOOD_DOMAIN,
        ARGO_AUTH: config.ARGO_AUTH,
        ARGO_DOMAIN: config.ARGO_DOMAIN
      });
    } catch (parseError) {
      return res.status(500).json({ error: '解析 JSON 失败' });
    }
  });
});

app.post('/updateConfig', async (req, res) => {
  const { GOOD_DOMAIN, ARGO_AUTH, ARGO_DOMAIN } = req.body;

  if (!GOOD_DOMAIN && !ARGO_AUTH && !ARGO_DOMAIN) {
    return res.status(400).json({ success: false, error: '请至少填写一个字段' });
  }

  try {
    const data = fs.readFileSync(SINGBOX_CONFIG_PATH, 'utf8');
    const config = JSON.parse(data);

    if (GOOD_DOMAIN) config.GOOD_DOMAIN = GOOD_DOMAIN;
    if (ARGO_AUTH) config.ARGO_AUTH = ARGO_AUTH;
    if (ARGO_DOMAIN) config.ARGO_DOMAIN = ARGO_DOMAIN;

    fs.writeFileSync(SINGBOX_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log('配置已更新');

    stopShellCommand();
    setTimeout(() => {
        runShellCommand();
    }, 3000); 

    res.json({ success: true, message: '配置更新成功并重启singbox' });

  } catch (err) {
    console.error('更新失败:', err);
    res.status(500).json({ success: false, error: '更新失败，请稍后再试' });
  }
});

app.get("/config", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "config.html"));
});

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (err) {
        console.error("读取配置文件失败:", err);
        return null;
    }
}

function writeConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
        console.log("配置文件更新成功！");
    stopShellCommand();
    setTimeout(() => {
        runShellCommand();
    }, 3000); 
    } catch (err) {
        console.error("写入配置文件失败:", err);
    }
}

app.get("/getOutboundStatus", (req, res) => {
    let config = readConfig();
    if (!config) return res.status(500).json({ error: "读取配置失败" });

    let status = "未出站";
    if (config.outbounds.some(outbound => outbound.type === "wireguard")) {
        status = "已配置 WireGuard";
    } else if (config.outbounds.some(outbound => outbound.type === "socks")) {
        status = "已配置 Socks";
    }

    res.json({ status });
});

app.post("/setWireGuard", (req, res) => {
    let config = readConfig();
    if (!config) return res.status(500).json({ error: "读取配置失败" });

    config.outbounds = config.outbounds.filter(outbound => outbound.type !== "socks");

    config.outbounds.unshift({
        "type": "wireguard",
        "tag": "wireguard-out",
        "server": "162.159.195.100",
        "server_port": 4500,
        "local_address": [
            "172.16.0.2/32",
            "2606:4700:110:83c7:b31f:5858:b3a8:c6b1/128"
        ],
        "private_key": "mPZo+V9qlrMGCZ7+E6z2NI6NOV34PD++TpAR09PtCWI=",
        "peer_public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
        "reserved": [26, 21, 228]
    });

    if (config.route && config.route.rules.length > 0) {
        config.route.rules[0].outbound = "wireguard-out";
    }

    writeConfig(config);
    res.json({ message: "WireGuard 出站已设置" });
});

app.post("/setSocks", (req, res) => {
    const { server, server_port, username, password } = req.body;
    if (!server || !server_port || !username || !password) {
        return res.status(400).json({ error: "参数不完整" });
    }

    let config = readConfig();
    if (!config) return res.status(500).json({ error: "读取配置失败" });

    config.outbounds = config.outbounds.filter(outbound => outbound.type !== "wireguard");

    config.outbounds.unshift({
        "type": "socks",
        "tag": "socks5_outbound",
        "server": server,
        "server_port": parseInt(server_port),
        "version": "5",
        "username": username,
        "password": password
    });

    if (config.route && config.route.rules.length > 0) {
        config.route.rules[0].outbound = "socks5_outbound";
    }

    writeConfig(config);
    res.json({ message: "Socks 出站已设置" });
});

app.post("/disableOutbound", (req, res) => {
    let config = readConfig();
    if (!config) return res.status(500).json({ error: "读取配置失败" });

    config.outbounds = config.outbounds.filter(outbound =>
        outbound.type !== "wireguard" && outbound.type !== "socks"
    );

    if (config.route && config.route.rules.length > 0) {
        config.route.rules[0].outbound = "direct";
    }

    writeConfig(config);
    res.json({ message: "已关闭出站" });
});

app.get("/outbounds", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "outbounds.html"));
});

app.use((req, res, next) => {
    const validPaths = ["/info", "/hy2ip", "/node", "/log", "/newset", "/config", "/outbounds"];
    if (validPaths.includes(req.path)) {
        return next();
    }
    res.status(404).send("页面未找到");
});
app.listen(3000, () => {
    const timestamp = new Date().toLocaleString();
    const startMsg = `${timestamp} 服务器已启动，监听端口 3000`;
    logMessage(startMsg);
    console.log(startMsg);
});
