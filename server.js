const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============================================================================
// CONFIGURATION
// ============================================================================
const ADMIN_PASSWORD = 'mifygzifyzgefizyefgzfe'; // ✅ CHANGEZ CE MOT DE PASSE !

// Base de données en mémoire (en production, utiliser MongoDB, PostgreSQL, etc.)
let versions = [
    { id: '5', number: '1.4', name: 'Temp Ban Fix', description: 'VGC Emulator fixed', enabled: false, downloads: 0 }
];

let logs = [];

// Sessions d'authentification (en mémoire)
let activeSessions = new Set();

function addLog(message) {
    logs.unshift({
        timestamp: new Date().toISOString(),
        message: message
    });
    if (logs.length > 200) logs = logs.slice(0, 200);
}

// ============================================================================
// MIDDLEWARE D'AUTHENTIFICATION
// ============================================================================
function isAuthenticated(req) {
    const sessionId = req.headers['x-session-id'];
    return sessionId && activeSessions.has(sessionId);
}

// ============================================================================
// ROUTES PUBLIQUES (pour le programme C++)
// ============================================================================

// Route pour vérifier si une version est activée
app.get('/api/check-version', (req, res) => {
    const requestedVersion = req.query.version;
    
    if (!requestedVersion) {
        return res.status(400).json({ 
            error: 'Version parameter required',
            enabled: false 
        });
    }
    
    const version = versions.find(v => v.number === requestedVersion);
    
    if (!version) {
        addLog(`Unknown version ${requestedVersion} tried to connect from ${req.ip}`);
        return res.json({
            enabled: false,
            version: requestedVersion,
            message: 'Unknown version'
        });
    }
    
    addLog(`Version ${requestedVersion} check from ${req.ip} - ${version.enabled ? 'ALLOWED' : 'BLOCKED'}`);
    
    res.json({
        enabled: version.enabled,
        version: version.number,
        name: version.name,
        message: version.enabled 
            ? `Version ${version.number} is active` 
            : `Version ${version.number} is no longer supported. Please update.`
    });
});

// Route pour incrémenter le compteur de téléchargements
app.post('/api/increment-version', (req, res) => {
    const versionNumber = req.query.version;
    
    if (!versionNumber) {
        return res.status(400).json({ error: 'Version parameter required' });
    }
    
    const version = versions.find(v => v.number === versionNumber);
    
    if (version) {
        version.downloads = (version.downloads || 0) + 1;
        addLog(`Download: v${versionNumber} (Total: ${version.downloads})`);
        
        res.json({ 
            success: true, 
            version: versionNumber,
            downloads: version.downloads 
        });
    } else {
        res.status(404).json({ error: 'Version not found' });
    }
});

// ============================================================================
// ROUTES D'AUTHENTIFICATION
// ============================================================================

// Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        activeSessions.add(sessionId);
        
        addLog(`Admin login successful from ${req.ip}`);
        
        res.json({ 
            success: true, 
            sessionId: sessionId,
            message: 'Login successful' 
        });
    } else {
        addLog(`Failed login attempt from ${req.ip}`);
        res.status(401).json({ 
            success: false, 
            error: 'Invalid password' 
        });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        activeSessions.delete(sessionId);
        addLog(`Admin logout from ${req.ip}`);
    }
    res.json({ success: true });
});

// Vérifier la session
app.get('/api/check-auth', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const authenticated = sessionId && activeSessions.has(sessionId);
    res.json({ authenticated });
});

// ============================================================================
// ROUTES PROTÉGÉES (nécessitent authentification)
// ============================================================================

// Obtenir toutes les versions
app.get('/api/versions', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({
        versions: versions,
        totalDownloads: versions.reduce((sum, v) => sum + (v.downloads || 0), 0),
        activeVersions: versions.filter(v => v.enabled).length
    });
});

// Obtenir les logs
app.get('/api/logs', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({ logs: logs.slice(0, 100) });
});

// Activer/Désactiver une version
app.post('/api/version/toggle', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { versionId } = req.body;
    
    const version = versions.find(v => v.id === versionId);
    if (!version) {
        return res.status(404).json({ error: 'Version not found' });
    }
    
    version.enabled = !version.enabled;
    addLog(`Version ${version.number} ${version.enabled ? 'ENABLED' : 'DISABLED'} by admin from ${req.ip}`);
    
    res.json({ 
        success: true, 
        version: version 
    });
});

// Désactiver toutes sauf une
app.post('/api/version/only-this', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { versionId } = req.body;
    
    versions = versions.map(v => ({
        ...v,
        enabled: v.id === versionId
    }));
    
    const activeVersion = versions.find(v => v.id === versionId);
    addLog(`All versions disabled except ${activeVersion.number} by admin from ${req.ip}`);
    
    res.json({ 
        success: true, 
        versions: versions 
    });
});

// Activer toutes les versions
app.post('/api/version/enable-all', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    versions = versions.map(v => ({ ...v, enabled: true }));
    addLog(`All versions enabled by admin from ${req.ip}`);
    
    res.json({ 
        success: true, 
        versions: versions 
    });
});

// Désactiver toutes les versions
app.post('/api/version/disable-all', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    versions = versions.map(v => ({ ...v, enabled: false }));
    addLog(`All versions disabled by admin from ${req.ip}`);
    
    res.json({ 
        success: true, 
        versions: versions 
    });
});

// Ajouter une nouvelle version
app.post('/api/version/add', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { number, name, description } = req.body;
    
    if (!number || !name) {
        return res.status(400).json({ error: 'Number and name required' });
    }
    
    const newVersion = {
        id: Date.now().toString(),
        number,
        name,
        description: description || '',
        enabled: true,
        downloads: 0
    };
    
    versions.push(newVersion);
    addLog(`New version ${number} added by admin from ${req.ip}`);
    
    res.json({ 
        success: true, 
        version: newVersion 
    });
});

// Supprimer une version
app.post('/api/version/delete', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { versionId } = req.body;
    
    const version = versions.find(v => v.id === versionId);
    if (!version) {
        return res.status(404).json({ error: 'Version not found' });
    }
    
    versions = versions.filter(v => v.id !== versionId);
    addLog(`Version ${version.number} deleted by admin from ${req.ip}`);
    
    res.json({ 
        success: true 
    });
});

// Mettre à jour une version
app.post('/api/version/update', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { versionId, updates } = req.body;
    
    const versionIndex = versions.findIndex(v => v.id === versionId);
    if (versionIndex === -1) {
        return res.status(404).json({ error: 'Version not found' });
    }
    
    versions[versionIndex] = {
        ...versions[versionIndex],
        ...updates
    };
    
    addLog(`Version ${versions[versionIndex].number} updated by admin from ${req.ip}`);
    
    res.json({ 
        success: true, 
        version: versions[versionIndex] 
    });
});

// ============================================================================
// PAGE HTML D'ADMINISTRATION AVEC AUTHENTIFICATION
// ============================================================================

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xeno Version Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        
        /* Login Screen */
        .login-container {
            max-width: 400px;
            margin: 100px auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        }
        .login-container h1 {
            color: #667eea;
            margin-bottom: 30px;
            font-size: 32px;
        }
        .login-container input {
            width: 100%;
            padding: 15px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 16px;
            margin-bottom: 20px;
            transition: border-color 0.3s;
        }
        .login-container input:focus {
            outline: none;
            border-color: #667eea;
        }
        .login-container button {
            width: 100%;
            padding: 15px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .login-container button:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }
        .error-message {
            color: #ef4444;
            margin-top: 15px;
            font-size: 14px;
        }
        
        /* Dashboard */
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 32px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 20px;
        }
        .logout-btn {
            float: right;
            padding: 10px 20px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
        .logout-btn:hover {
            background: #dc2626;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .stat-number {
            font-size: 42px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 14px;
            opacity: 0.9;
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }
        .btn-primary { background: #667eea; color: white; }
        .btn-success { background: #10b981; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-warning { background: #f59e0b; color: white; }
        .versions-list {
            display: grid;
            gap: 20px;
            margin-bottom: 30px;
        }
        .version-card {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            border-left: 5px solid #667eea;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.3s;
        }
        .version-card:hover {
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            transform: translateX(5px);
        }
        .version-card.disabled {
            border-left-color: #ef4444;
            opacity: 0.6;
        }
        .version-info h3 {
            font-size: 28px;
            color: #667eea;
            margin-bottom: 8px;
        }
        .version-name {
            font-size: 18px;
            color: #333;
            font-weight: 600;
            margin-bottom: 5px;
        }
        .version-desc {
            color: #666;
            font-size: 14px;
        }
        .status-badge {
            display: inline-block;
            padding: 6px 15px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            margin-left: 10px;
        }
        .status-active {
            background: #d1fae5;
            color: #065f46;
        }
        .status-disabled {
            background: #fee2e2;
            color: #991b1b;
        }
        .version-actions {
            display: flex;
            gap: 10px;
        }
        .logs {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            max-height: 400px;
            overflow-y: auto;
        }
        .log-entry {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
        }
        .log-entry:last-child {
            border-bottom: none;
        }
        .add-version-form {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 15px;
            margin-bottom: 15px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <!-- Login Screen -->
    <div id="loginScreen" class="login-container">
        <h1>🔐 Admin Login</h1>
        <input type="password" id="passwordInput" placeholder="Enter admin password" onkeypress="if(event.key==='Enter') login()">
        <button onclick="login()">Login</button>
        <div id="loginError" class="error-message"></div>
    </div>

    <!-- Dashboard (hidden by default) -->
    <div id="dashboard" class="container hidden">
        <button class="logout-btn" onclick="logout()">🚪 Logout</button>
        <h1>🎮 Xeno Version Manager</h1>
        <p class="subtitle">Control your program versions remotely</p>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number" id="totalVersions">0</div>
                <div class="stat-label">Total Versions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="activeVersions">0</div>
                <div class="stat-label">Active Versions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalDownloads">0</div>
                <div class="stat-label">Total Downloads</div>
            </div>
        </div>
        
        <div class="actions">
            <button class="btn-success" onclick="showAddForm()">➕ Add Version</button>
            <button class="btn-primary" onclick="enableAll()">✓ Enable All</button>
            <button class="btn-danger" onclick="disableAll()">✗ Disable All</button>
            <button class="btn-primary" onclick="loadData()">🔄 Refresh</button>
        </div>
        
        <div id="addForm" class="add-version-form" style="display:none;">
            <h3 style="margin-bottom:15px;">Add New Version</h3>
            <input type="text" id="newNumber" placeholder="Version Number (e.g., 1.5)">
            <input type="text" id="newName" placeholder="Version Name (e.g., Bug Fixes)">
            <input type="text" id="newDesc" placeholder="Description (optional)">
            <button class="btn-success" onclick="addVersion()">Create Version</button>
            <button class="btn-danger" onclick="hideAddForm()">Cancel</button>
        </div>
        
        <h2 style="margin-bottom:20px;">📦 Versions</h2>
        <div id="versionsList" class="versions-list"></div>
        
        <h2 style="margin-bottom:20px;">📊 Activity Logs</h2>
        <div id="logs" class="logs"></div>
    </div>
    
    <script>
        const API = window.location.origin + '/api';
        let sessionId = localStorage.getItem('sessionId');
        
        // Vérifier l'authentification au chargement
        async function checkAuth() {
            if (!sessionId) {
                showLogin();
                return;
            }
            
            try {
                const res = await fetch(API + '/check-auth', {
                    headers: { 'x-session-id': sessionId }
                });
                const data = await res.json();
                
                if (data.authenticated) {
                    showDashboard();
                    loadData();
                } else {
                    showLogin();
                }
            } catch (error) {
                showLogin();
            }
        }
        
        function showLogin() {
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('dashboard').classList.add('hidden');
        }
        
        function showDashboard() {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
        }
        
        async function login() {
            const password = document.getElementById('passwordInput').value;
            const errorDiv = document.getElementById('loginError');
            
            if (!password) {
                errorDiv.textContent = 'Please enter a password';
                return;
            }
            
            try {
                const res = await fetch(API + '/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    sessionId = data.sessionId;
                    localStorage.setItem('sessionId', sessionId);
                    document.getElementById('passwordInput').value = '';
                    errorDiv.textContent = '';
                    showDashboard();
                    loadData();
                } else {
                    errorDiv.textContent = 'Invalid password';
                    document.getElementById('passwordInput').value = '';
                }
            } catch (error) {
                errorDiv.textContent = 'Connection error';
            }
        }
        
        async function logout() {
            try {
                await fetch(API + '/logout', {
                    method: 'POST',
                    headers: { 'x-session-id': sessionId }
                });
            } catch (error) {}
            
            sessionId = null;
            localStorage.removeItem('sessionId');
            showLogin();
        }
        
        async function loadData() {
            if (!sessionId) return;
            
            try {
                const res = await fetch(API + '/versions', {
                    headers: { 'x-session-id': sessionId }
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                const data = await res.json();
                
                document.getElementById('totalVersions').textContent = data.versions.length;
                document.getElementById('activeVersions').textContent = data.activeVersions;
                document.getElementById('totalDownloads').textContent = data.totalDownloads;
                
                const sortedVersions = data.versions.sort((a, b) => 
                    parseFloat(b.number) - parseFloat(a.number)
                );
                
                document.getElementById('versionsList').innerHTML = sortedVersions.map(v => \`
                    <div class="version-card \${!v.enabled ? 'disabled' : ''}">
                        <div class="version-info">
                            <h3>v\${v.number}
                                <span class="status-badge status-\${v.enabled ? 'active' : 'disabled'}">
                                    \${v.enabled ? 'ACTIVE' : 'DISABLED'}
                                </span>
                            </h3>
                            <div class="version-name">\${v.name}</div>
                            <div class="version-desc">\${v.description} • \${v.downloads || 0} downloads</div>
                        </div>
                        <div class="version-actions">
                            <button class="btn-\${v.enabled ? 'danger' : 'success'}" 
                                    onclick="toggleVersion('\${v.id}')">
                                \${v.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button class="btn-warning" onclick="onlyThis('\${v.id}')">
                                Only This
                            </button>
                            <button class="btn-danger" onclick="deleteVersion('\${v.id}')">
                                Delete
                            </button>
                        </div>
                    </div>
                \`).join('');
                
                const logsRes = await fetch(API + '/logs', {
                    headers: { 'x-session-id': sessionId }
                });
                const logsData = await logsRes.json();
                
                document.getElementById('logs').innerHTML = logsData.logs
                    .map(log => \`
                        <div class="log-entry">
                            <strong>\${new Date(log.timestamp).toLocaleString()}</strong>: \${log.message}
                        </div>
                    \`).join('') || '<div class="log-entry">No logs yet</div>';
            } catch (error) {
                console.error('Error loading data:', error);
            }
        }
        
        async function toggleVersion(id) {
            try {
                const res = await fetch(API + '/version/toggle', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId 
                    },
                    body: JSON.stringify({ versionId: id })
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                loadData();
            } catch (error) {
                alert('Error toggling version');
            }
        }
        
        async function onlyThis(id) {
            if (!confirm('Disable all other versions?')) return;
            try {
                const res = await fetch(API + '/version/only-this', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId 
                    },
                    body: JSON.stringify({ versionId: id })
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                loadData();
            } catch (error) {
                alert('Error updating versions');
            }
        }
        
        async function deleteVersion(id) {
            if (!confirm('Delete this version?')) return;
            try {
                const res = await fetch(API + '/version/delete', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId 
                    },
                    body: JSON.stringify({ versionId: id })
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                loadData();
            } catch (error) {
                alert('Error deleting version');
            }
        }
        
        async function enableAll() {
            try {
                const res = await fetch(API + '/version/enable-all', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId 
                    },
                    body: JSON.stringify({})
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                loadData();
            } catch (error) {
                alert('Error enabling all versions');
            }
        }
        
        async function disableAll() {
            if (!confirm('Disable ALL versions?')) return;
            try {
                const res = await fetch(API + '/version/disable-all', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId 
                    },
                    body: JSON.stringify({})
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                loadData();
            } catch (error) {
                alert('Error disabling all versions');
            }
        }
        
        function showAddForm() {
            document.getElementById('addForm').style.display = 'block';
        }
        
        function hideAddForm() {
            document.getElementById('addForm').style.display = 'none';
            document.getElementById('newNumber').value = '';
            document.getElementById('newName').value = '';
            document.getElementById('newDesc').value = '';
        }
        
        async function addVersion() {
            const number = document.getElementById('newNumber').value.trim();
            const name = document.getElementById('newName').value.trim();
            const description = document.getElementById('newDesc').value.trim();
            
            if (!number || !name) {
                alert('Version number and name are required');
                return;
            }
            
            try {
                const res = await fetch(API + '/version/add', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId
                    },
                    body: JSON.stringify({ number, name, description })
                });
                
                if (res.status === 401) {
                    logout();
                    return;
                }
                
                const result = await res.json();
                
                if (result.success) {
                    alert('Version added successfully!');
                    hideAddForm();
                    loadData();
                } else {
                    alert('Error: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Error adding version');
            }
        }
        
        // Charger au démarrage
        checkAuth();
        
        // Rafraîchir toutes les 10 secondes (seulement si authentifié)
        setInterval(() => {
            if (sessionId && !document.getElementById('dashboard').classList.contains('hidden')) {
                loadData();
            }
        }, 10000);
    </script>
</body>
</html>
    `);
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n✅ Xeno Version Manager running on http://localhost:${PORT}`);
    console.log(`📊 Admin panel: http://localhost:${PORT}`);
    console.log(`🔑 Admin Password: ${ADMIN_PASSWORD}\n`);
});

// Export pour Vercel
module.exports = app;




