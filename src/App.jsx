import React, { useState, useEffect, useCallback, useRef } from 'react';
import yaml from 'js-yaml';
import { Download, Plus, Trash2, Copy, Pointer, Sparkles, CheckCircle2, GripVertical, Upload } from 'lucide-react';
import './index.css';

const STEP_METADATA = {
  aiTap: { label: 'Click / Tap', description: 'Use AI to find and click an element by description.', example: "aiTap: \"the Delete button next to user 'user1'\"" },
  aiInput: { label: 'Input / Type', description: 'Type text into a field found by AI.', example: "aiInput: \"the Search field\" \n  value: \"John Doe\"" },
  aiKeyboardPress: { label: 'Press Key', description: 'Simulate a specific key press (like Enter or Tab).', example: "aiKeyboardPress: \"Press Enter to submit the form\" \n  keyName: \"Enter\"" },
  aiAssert: { label: 'Assert / Verify', description: 'Confirm if an element or text is present on the page.', example: "aiAssert: \"The user 'abc' is visible in the list\"" },
  aiQuery: { label: 'Query / Extract', description: 'Extract information or data from the page using natural language.', example: "aiQuery: \"Return the phone number of the user in the first row\"" },
  aiWaitFor: { label: 'Wait For', description: 'Wait until a specific element or text appears.', example: "aiWaitFor: \"the success toast notification\" \n  timeout: 10000" },
  sleep: { label: 'Sleep / Delay', description: 'Wait for a specific duration in milliseconds.', example: "sleep: 2000 # Wait for 2 seconds" },
  javascript: { label: 'JS Script', description: 'Run custom JavaScript code in the browser context.', example: "javascript: document.querySelector('button').click()" }
};

const STEP_TYPES = Object.keys(STEP_METADATA);

const normalizeYamlValue = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  // Keep numeric-only values as numbers in YAML instead of quoted strings.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
  }

  return value;
};

function InsertTaskDivider({ onInsert }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'default' }}>
      {hovered && (
        <button onClick={onInsert} style={{
          position: 'absolute', zIndex: 10, background: 'var(--primary-color)', border: 'none', borderRadius: '20px',
          color: 'white', fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.75rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.3rem', boxShadow: '0 2px 8px rgba(99,102,241,0.4)', whiteSpace: 'nowrap'
        }}>
          <Plus size={11} /> Insert Task Here
        </button>
      )}
      <div style={{ width: '100%', height: '2px', background: hovered ? 'rgba(99,102,241,0.5)' : 'transparent', transition: 'background 0.15s', borderRadius: '2px' }} />
    </div>
  );
}

function InsertStepDivider({ onInsert }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'default' }}>
      {hovered && (
        <button onClick={onInsert} style={{
          position: 'absolute', zIndex: 10, background: 'rgba(99,102,241,0.9)', border: 'none', borderRadius: '20px',
          color: 'white', fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.6rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.25rem', boxShadow: '0 2px 6px rgba(99,102,241,0.35)', whiteSpace: 'nowrap'
        }}>
          <Plus size={10} /> Insert Step
        </button>
      )}
      <div style={{ width: '80%', height: '1px', background: hovered ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)', transition: 'background 0.15s' }} />
    </div>
  );
}

function App() {
  const defaultConfig = {
    web: { url: '${APP_URL}', viewportWidth: 1280, viewportHeight: 800 },
    agent: { groupName: 'My Project', generateReport: true }
  };
  const [config, setConfig] = useState({
    web: { url: '${APP_URL}', viewportWidth: 1280, viewportHeight: 800 },
    agent: { groupName: 'My Project', generateReport: true }
  });
  const [denyPermissionPrompts, setDenyPermissionPrompts] = useState(false);
  const [tasks, setTasks] = useState([{
    id: crypto.randomUUID(), name: 'My First Test',
    flow: [{ id: crypto.randomUUID(), type: 'aiTap', instruction: 'the Login button', xpath: '' }]
  }]);
  const [projectDescription, setProjectDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(() => null);
  const [activeStepId, setActiveStepId] = useState(null);
  const [xpathConnection, setXpathConnection] = useState('Listening for XPath...');
  const [wsConnected, setWsConnected] = useState(true);
  const [pendingXPath, setPendingXPath] = useState(null);
  const importInputRef = useRef(null);

  // Drag state for tasks
  const dragTaskId = useRef(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);

  // Drag state for steps
  const dragStepId = useRef(null);
  const dragStepTaskId = useRef(null);
  const [draggingStepId, setDraggingStepId] = useState(null);
  const [dragOverStepId, setDragOverStepId] = useState(null);

  const activeStepIdRef = useRef(activeStepId);
  useEffect(() => { activeStepIdRef.current = activeStepId; }, [activeStepId]);

  // Init activeTaskId after tasks are created
  useEffect(() => {
    if (tasks.length > 0 && !activeTaskId) setActiveTaskId(tasks[0].id);
  }, []);

  useEffect(() => {
    if (activeStepId && pendingXPath) {
      setTasks(prev => prev.map(task => ({
        ...task, flow: task.flow.map(step => {
          if (step.id === activeStepId && step.type !== 'sleep' && step.type !== 'javascript') return { ...step, xpath: pendingXPath };
          return step;
        })
      })));
      setXpathConnection(`Applied: ${pendingXPath} at ${new Date().toLocaleTimeString()}`);
      setPendingXPath(null);
    }
  }, [activeStepId, pendingXPath]);

  const applyXPathToActiveStep = useCallback((xpath) => {
    setXpathConnection(`Received: ${xpath} at ${new Date().toLocaleTimeString()}`);
    if (activeStepIdRef.current) {
      setTasks(prev => prev.map(task => ({
        ...task, flow: task.flow.map(step => {
          if (step.id === activeStepIdRef.current && step.type !== 'sleep' && step.type !== 'javascript') return { ...step, xpath };
          return step;
        })
      })));
    } else {
      setPendingXPath(xpath);
    }
  }, []);

  useEffect(() => {
    if (import.meta.hot) import.meta.hot.on('xpath:received', (data) => applyXPathToActiveStep(data.xpath));
    else setWsConnected(false);
  }, [applyXPathToActiveStep]);

  useEffect(() => {
    window.name = 'yaml-builder';
    const handleStorage = (e) => {
      if (e.key === 'pending_xpath' && e.newValue) {
        try { const { xpath } = JSON.parse(e.newValue); applyXPathToActiveStep(xpath); localStorage.removeItem('pending_xpath'); } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [applyXPathToActiveStep]);

  const updateConfig = (section, field, value) => setConfig(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  // ── Task CRUD ──────────────────────────────────────────────────────
  const addTaskAt = (afterIndex) => {
    const newTask = { id: crypto.randomUUID(), name: 'New Test Task', flow: [] };
    setTasks(prev => { const copy = [...prev]; copy.splice(afterIndex + 1, 0, newTask); return copy; });
    setActiveTaskId(newTask.id);
  };
  const addTask = () => setTasks(prev => {
    const newTask = { id: crypto.randomUUID(), name: 'New Test Task', flow: [] };
    setActiveTaskId(newTask.id);
    return [...prev, newTask];
  });
  const removeTask = (taskId) => {
    setTasks(prev => {
      const newTasks = prev.filter(t => t.id !== taskId);
      if (activeTaskId === taskId && newTasks.length > 0) setActiveTaskId(newTasks[0].id);
      return newTasks;
    });
  };
  const updateTaskTarget = (taskId, newName) => setTasks(prev => prev.map(t => t.id === taskId ? { ...t, name: newName } : t));

  // ── Task drag-and-drop ─────────────────────────────────────────────
  const handleTaskDragStart = (e, taskId) => { dragTaskId.current = taskId; setDraggingTaskId(taskId); e.dataTransfer.effectAllowed = 'move'; };
  const handleTaskDragOver = (e, taskId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTaskId(taskId); };
  const handleTaskDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragTaskId.current || dragTaskId.current === targetId) { setDraggingTaskId(null); setDragOverTaskId(null); return; }
    setTasks(prev => {
      const copy = [...prev];
      const fromIdx = copy.findIndex(t => t.id === dragTaskId.current);
      const toIdx = copy.findIndex(t => t.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
    setDraggingTaskId(null); setDragOverTaskId(null); dragTaskId.current = null;
  };
  const handleTaskDragEnd = () => { setDraggingTaskId(null); setDragOverTaskId(null); dragTaskId.current = null; };

  // ── Step CRUD ──────────────────────────────────────────────────────
  const addStepAt = (taskId, afterIndex, type = 'aiTap') => {
    const newStep = { id: crypto.randomUUID(), type, instruction: '', xpath: '', value: type === 'sleep' ? 1000 : '' };
    setActiveStepId(newStep.id);
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const copy = [...t.flow];
      copy.splice(afterIndex + 1, 0, newStep);
      return { ...t, flow: copy };
    }));
  };
  const addStep = (taskId) => setTasks(prev => {
    const task = prev.find(t => t.id === taskId);
    const newStep = { id: crypto.randomUUID(), type: 'aiTap', instruction: '', xpath: '', value: '' };
    setActiveStepId(newStep.id);
    return prev.map(t => t.id === taskId ? { ...t, flow: [...t.flow, newStep] } : t);
  });
  const updateStep = (taskId, stepId, field, value) => setTasks(prev => prev.map(t => t.id === taskId ? { ...t, flow: t.flow.map(s => s.id === stepId ? { ...s, [field]: value } : s) } : t));
  const removeStep = (taskId, stepId) => setTasks(prev => prev.map(t => t.id === taskId ? { ...t, flow: t.flow.filter(s => s.id !== stepId) } : t));

  // ── Step drag-and-drop ─────────────────────────────────────────────
  const handleStepDragStart = (e, taskId, stepId) => { e.stopPropagation(); dragStepId.current = stepId; dragStepTaskId.current = taskId; setDraggingStepId(stepId); e.dataTransfer.effectAllowed = 'move'; };
  const handleStepDragOver = (e, stepId) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverStepId(stepId); };
  const handleStepDrop = (e, taskId, targetStepId) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragStepId.current || dragStepId.current === targetStepId || dragStepTaskId.current !== taskId) { setDraggingStepId(null); setDragOverStepId(null); return; }
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const copy = [...t.flow];
      const fromIdx = copy.findIndex(s => s.id === dragStepId.current);
      const toIdx = copy.findIndex(s => s.id === targetStepId);
      if (fromIdx === -1 || toIdx === -1) return t;
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return { ...t, flow: copy };
    }));
    setDraggingStepId(null); setDragOverStepId(null); dragStepId.current = null; dragStepTaskId.current = null;
  };
  const handleStepDragEnd = () => { setDraggingStepId(null); setDragOverStepId(null); dragStepId.current = null; };

  // ── YAML ───────────────────────────────────────────────────────────
  const generateYaml = () => {
    const webSection = { ...config.web };
    if (denyPermissionPrompts) webSection.chromeArgs = ['--deny-permission-prompts'];
    const obj = {
      web: webSection, agent: config.agent,
      tasks: tasks.map(t => ({
        name: t.name,
        flow: t.flow.map(s => {
          if (s.type === 'sleep') return { sleep: parseInt(s.value) || 1000 };
          if (s.type === 'javascript') return { javascript: s.value };
          const stepObj = { [s.type]: s.instruction || null };
          if (s.xpath) stepObj.xpath = s.xpath;
          if (s.type === 'aiInput' && s.value !== '') stepObj.value = normalizeYamlValue(s.value);
          if (s.type === 'aiKeyboardPress' && s.value) stepObj.keyName = s.value;
          if (s.type === 'aiWaitFor' && s.value) stepObj.timeout = parseInt(s.value);
          return stepObj;
        })
      }))
    };
    const descComment = projectDescription.trim() ? `# Description: ${projectDescription.trim()}\n` : '';
    return '# Generated by Midscene AI Builder\n' + descComment + '\n' + yaml.dump(obj, {
      sortKeys: false,
      lineWidth: -1,
      styles: { '!!null': 'empty' }
    });
  };

  const descriptionValid = projectDescription.trim().length >= 100;
  const triggerYamlImport = () => {
    if (importInputRef.current) importInputRef.current.click();
  };

  const buildImportedStep = (rawStep) => {
    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) return null;

    const stepType = STEP_TYPES.find(type => Object.prototype.hasOwnProperty.call(rawStep, type));
    if (!stepType) return null;

    const step = {
      id: crypto.randomUUID(),
      type: stepType,
      instruction: String(rawStep[stepType] ?? ''),
      xpath: String(rawStep.xpath ?? ''),
      value: ''
    };

    if (stepType === 'aiInput') step.value = rawStep.value ?? '';
    else if (stepType === 'aiKeyboardPress') step.value = rawStep.keyName ?? '';
    else if (stepType === 'aiWaitFor') step.value = rawStep.timeout ?? '';
    else if (stepType === 'sleep') step.value = rawStep.sleep ?? 1000;
    else if (stepType === 'javascript') step.value = rawStep.javascript ?? '';

    return step;
  };

  const sanitizeImportedYaml = (rawText) => {
    const lines = rawText.split(/\r?\n/);
    const firstYamlKeyIndex = lines.findIndex(line => /^(web|agent|tasks):\s*$/.test(line.trim()));
    if (firstYamlKeyIndex === -1) return rawText;

    return lines.slice(firstYamlKeyIndex).join('\n');
  };

  const handleYamlImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = yaml.load(sanitizeImportedYaml(rawText));

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('The file must contain a YAML object with web, agent, and tasks sections.');
      }

      const descriptionMatch = rawText.match(/^\s*#\s*Description:\s*(.+)$/m);
      const importedTasks = Array.isArray(parsed.tasks)
        ? parsed.tasks.map(task => {
          const flow = Array.isArray(task?.flow)
            ? task.flow.map(buildImportedStep).filter(Boolean)
            : [];

          return {
            id: crypto.randomUUID(),
            name: String(task?.name ?? 'Imported Test Task'),
            flow
          };
        })
        : [];

      const importedWeb = parsed.web && typeof parsed.web === 'object' ? parsed.web : {};
      const importedAgent = parsed.agent && typeof parsed.agent === 'object' ? parsed.agent : {};

      setConfig({
        web: {
          url: String(importedWeb.url ?? defaultConfig.web.url),
          viewportWidth: Number(importedWeb.viewportWidth) || defaultConfig.web.viewportWidth,
          viewportHeight: Number(importedWeb.viewportHeight) || defaultConfig.web.viewportHeight
        },
        agent: {
          groupName: String(importedAgent.groupName ?? defaultConfig.agent.groupName),
          generateReport: importedAgent.generateReport ?? defaultConfig.agent.generateReport
        }
      });
      setDenyPermissionPrompts(Array.isArray(importedWeb.chromeArgs) && importedWeb.chromeArgs.includes('--deny-permission-prompts'));
      setProjectDescription(descriptionMatch?.[1]?.trim() || '');
      setDescriptionTouched(false);
      const nextTasks = importedTasks.length > 0 ? importedTasks : [{ id: crypto.randomUUID(), name: 'Imported Test Task', flow: [] }];
      setTasks(nextTasks);
      setActiveTaskId(nextTasks[0]?.id ?? null);
      setActiveStepId(nextTasks[0]?.flow[0]?.id ?? null);
      setPendingXPath(null);
      setXpathConnection(`Imported ${file.name} at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('Failed to import YAML:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to import the selected YAML file.');
    }
  };

  const downloadYaml = () => {
    if (!descriptionValid) { setDescriptionTouched(true); return; }
    const blob = new Blob([generateYaml()], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (config.agent.groupName || 'test').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = (slug || 'test') + '.yaml'; a.click(); URL.revokeObjectURL(url);
  };
  const copyToClipboard = () => navigator.clipboard.writeText(generateYaml());

  const yamlBuilderOrigin = `${window.location.protocol}//${window.location.host}`;
  const bookmarkletCode = `javascript:(function(){document.body.style.cursor='crosshair';let h=function(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();function g(el){if(!el||el.nodeType!==1)return'';if(el.id)return'//*[@id="'+el.id+'"]';if(el===document.body)return'/html/body';if(!el.parentNode||!el.parentNode.childNodes)return'';let ix=0,s=el.parentNode.childNodes;for(let i=0;i<s.length;i++){if(s[i]===el){return g(el.parentNode)+'/'+el.tagName.toLowerCase()+'['+(ix+1)+']';}if(s[i].nodeType===1&&s[i].tagName===el.tagName)ix++;}return'';}let x=g(e.target);if(x){window.open('${yamlBuilderOrigin}/xpath-relay.html?xpath='+encodeURIComponent(x),'_blank','width=300,height=80,left=100,top=100');}document.removeEventListener('click',h,true);document.body.style.cursor='default';};document.addEventListener('click',h,true);})();`;
  const bookmarkletRef = useRef(null);
  useEffect(() => { if (bookmarkletRef.current) bookmarkletRef.current.setAttribute('href', bookmarkletCode); }, [bookmarkletCode]);

  return (
    <div className="app-container">
      <div className="glass-panel left-panel">
        <div className="panel-header">
          <h2><Sparkles size={20} color="var(--primary-color)" /> Midscene AI Test Builder</h2>
          <div className="header-actions">
            {!wsConnected && <span style={{ color: '#ef4444', fontSize: '12px' }}>Dev Server Only</span>}
            {wsConnected && <div className="xpath-connected"><div className="xpath-pulse"></div>{xpathConnection}</div>}
          </div>
        </div>

        <div className="panel-content">
          {pendingXPath && (
            <div style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <p style={{ color: '#fbbf24', fontWeight: 600, marginBottom: '0.2rem', fontSize: '0.875rem' }}>⏳ XPath ready — select a step to apply it</p>
                <code style={{ fontSize: '0.75rem', color: '#fde68a' }}>{pendingXPath}</code>
              </div>
              <button onClick={() => setPendingXPath(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
          )}

          <div className="bookmarklet-banner">
            <div>
              <p style={{ fontWeight: '500', color: 'white', marginBottom: '0.25rem' }}>🎯 Magic XPath Picker Tool</p>
              <p>Drag the button below to your bookmarks bar. Click it on any webpage, then click any element to grab its XPath straight into the editor! <strong>(Select a step first!)</strong></p>
            </div>
            <a ref={bookmarkletRef} onClick={e => e.preventDefault()}>Pick XPath</a>
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label>Target URL</label>
              <input type="text" value={config.web.url} onChange={e => updateConfig('web', 'url', e.target.value)} placeholder="e.g. \${APP_URL} or https://example.com" />
            </div>
            <div style={{ width: '150px' }}>
              <label>Project Name</label>
              <input type="text" value={config.agent.groupName} onChange={e => updateConfig('agent', 'groupName', e.target.value)} />
            </div>
          </div>

          {/* ── Browser Options ─────────────────────────────────────── */}
          <div className="form-group" style={{ marginTop: '0.25rem' }}>
            <label style={{ marginBottom: '0.6rem', display: 'block' }}>Browser Options</label>
            <label
              onClick={() => setDenyPermissionPrompts(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                padding: '0.6rem 1rem',
                background: denyPermissionPrompts ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${denyPermissionPrompts ? 'var(--primary-color)' : 'var(--border-color)'}`,
                borderRadius: '8px', transition: 'all 0.2s', userSelect: 'none', fontSize: '0.875rem'
              }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                background: denyPermissionPrompts ? 'var(--primary-color)' : 'transparent',
                border: `2px solid ${denyPermissionPrompts ? 'var(--primary-color)' : 'var(--border-color)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', fontSize: '11px', color: 'white'
              }}>
                {denyPermissionPrompts && '✓'}
              </span>
              <span style={{ color: denyPermissionPrompts ? 'var(--text-main)' : 'var(--text-muted)' }}>
                <code style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: denyPermissionPrompts ? '#a5b4fc' : 'var(--text-muted)', marginRight: '0.4rem' }}>
                  --deny-permission-prompts
                </code>
                Suppress browser permission dialogs
              </span>
            </label>
          </div>

          {/* ── Project Description ──────────────────────────────────── */}
          <div className="form-group" style={{ marginTop: '1.25rem' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Project Description <span style={{ color: '#ef4444' }}>*</span></span>
              <span style={{ fontSize: '0.75rem', color: descriptionTouched && projectDescription.trim().length < 100 ? '#ef4444' : '#64748b', fontWeight: 400 }}>
                {projectDescription.trim().length} / 100 min chars
              </span>
            </label>
            <textarea rows={3} value={projectDescription}
              onChange={e => { setProjectDescription(e.target.value); setDescriptionTouched(true); }}
              onBlur={() => setDescriptionTouched(true)}
              placeholder="Describe what this test project covers, e.g. 'Login flow for Hivestaff construction portal including email, password and submit validation.'"
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.875rem', borderColor: descriptionTouched && projectDescription.trim().length < 100 ? '#ef4444' : undefined }}
            />
            {descriptionTouched && projectDescription.trim().length < 100 && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.35rem' }}>Description must be at least 100 characters.</p>
            )}
          </div>

          {/* ── Test Tasks Header ──────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2rem 0 0.5rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Test Tasks
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                (<GripVertical size={11} /> drag to reorder)
              </span>
            </h3>
            <button className="btn-secondary" style={{ padding: '0.5rem', fontSize: '0.875rem' }} onClick={addTask}>
              <Plus size={16} /> Add Task
            </button>
          </div>

          {/* Insert before first task */}
          <InsertTaskDivider onInsert={() => addTaskAt(-1)} />

          {tasks.map((task, taskIdx) => (
            <React.Fragment key={task.id}>
              <div
                className={`task-card ${activeTaskId === task.id ? 'active' : ''} ${draggingTaskId === task.id ? 'task-dragging' : ''} ${dragOverTaskId === task.id && draggingTaskId !== task.id ? 'task-drag-over' : ''}`}
                onClick={() => setActiveTaskId(task.id)}
                draggable
                onDragStart={e => handleTaskDragStart(e, task.id)}
                onDragOver={e => handleTaskDragOver(e, task.id)}
                onDrop={e => handleTaskDrop(e, task.id)}
                onDragEnd={handleTaskDragEnd}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <span className="drag-handle" title="Drag to reorder"><GripVertical size={16} color="var(--text-muted)" /></span>
                    <input type="text" value={task.name} onChange={e => updateTaskTarget(task.id, e.target.value)} onClick={e => e.stopPropagation()}
                      style={{ background: 'transparent', border: 'none', padding: 0, fontSize: '1rem', fontWeight: 'bold', flex: 1 }} />
                  </div>
                  <button className="btn-icon btn-danger" onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}><Trash2 size={16} /></button>
                </div>

                {activeTaskId === task.id && (
                  <div style={{ marginTop: '1rem' }} onClick={e => e.stopPropagation()}>
                    {/* Insert before first step */}
                    {task.flow.length > 0 && <InsertStepDivider onInsert={() => addStepAt(task.id, -1)} />}

                    {task.flow.map((step, idx) => (
                      <React.Fragment key={step.id}>
                        <div
                          className={`step-card ${draggingStepId === step.id ? 'step-dragging' : ''} ${dragOverStepId === step.id && draggingStepId !== step.id ? 'step-drag-over' : ''}`}
                          onClick={() => setActiveStepId(step.id)}
                          style={{ borderColor: activeStepId === step.id ? 'var(--primary-color)' : 'var(--border-color)', cursor: 'pointer' }}
                          draggable
                          onDragStart={e => handleStepDragStart(e, task.id, step.id)}
                          onDragOver={e => handleStepDragOver(e, step.id)}
                          onDrop={e => handleStepDrop(e, task.id, step.id)}
                          onDragEnd={handleStepDragEnd}
                        >
                          <div className="step-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span className="drag-handle step-drag-handle" title="Drag to reorder step"><GripVertical size={13} color="var(--text-muted)" /></span>
                              <span className="step-type-badge">{idx + 1}. {STEP_METADATA[step.type]?.label || step.type}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <select value={step.type} onChange={e => updateStep(task.id, step.id, 'type', e.target.value)}
                                style={{ width: 'auto', padding: '0.25rem', fontSize: '0.75rem', height: 'auto' }}>
                                {STEP_TYPES.map(t => <option key={t} value={t}>{STEP_METADATA[t].label}</option>)}
                              </select>
                              <button className="btn-icon" onClick={(e) => { e.stopPropagation(); removeStep(task.id, step.id); }}><Trash2 size={14} /></button>
                            </div>
                          </div>
                          <div className="step-description">{STEP_METADATA[step.type]?.description}</div>
                          <div className="step-example">Example: <code>{STEP_METADATA[step.type]?.example}</code></div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                            {step.type !== 'sleep' && step.type !== 'javascript' && (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ flex: 1 }}>
                                  <input type="text" placeholder="What to tell AI? (e.g. 'the Login Button')" value={step.instruction}
                                    onChange={e => updateStep(task.id, step.id, 'instruction', e.target.value)} style={{ fontSize: '0.875rem' }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', paddingRight: '0.5rem' }}>
                                  <input type="text" placeholder="Optional: Target XPath" value={step.xpath}
                                    onChange={e => updateStep(task.id, step.id, 'xpath', e.target.value)}
                                    style={{ fontSize: '0.875rem', border: 'none', background: 'transparent' }} />
                                  <Pointer size={16} color={activeStepId === step.id ? 'var(--primary-color)' : 'var(--text-muted)'} title="Use Bookmarklet while this step is selected to auto-fill" />
                                </div>
                              </div>
                            )}
                            {step.type === 'aiInput' && <input type="text" placeholder="Value to input (e.g. \${USERNAME})" value={step.value} onChange={e => updateStep(task.id, step.id, 'value', e.target.value)} />}
                            {step.type === 'aiKeyboardPress' && <input type="text" placeholder="Key Name (e.g. Enter)" value={step.value} onChange={e => updateStep(task.id, step.id, 'value', e.target.value)} />}
                            {step.type === 'aiWaitFor' && <input type="number" placeholder="Timeout in ms (e.g. 5000)" value={step.value} onChange={e => updateStep(task.id, step.id, 'value', e.target.value)} />}
                            {step.type === 'sleep' && <input type="number" placeholder="Sleep in ms (e.g. 1000)" value={step.value} onChange={e => updateStep(task.id, step.id, 'value', e.target.value)} />}
                            {step.type === 'javascript' && <input type="text" placeholder="JS code to evaluate" value={step.value} onChange={e => updateStep(task.id, step.id, 'value', e.target.value)} />}
                          </div>
                        </div>
                        {/* Insert after each step */}
                        <InsertStepDivider onInsert={() => addStepAt(task.id, idx)} />
                      </React.Fragment>
                    ))}

                    {task.flow.length === 0 && (
                      <button className="btn-secondary" style={{ width: '100%' }} onClick={() => addStep(task.id)}>
                        <Plus size={16} /> Add First Step
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Insert task between divider */}
              <InsertTaskDivider onInsert={() => addTaskAt(taskIdx)} />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="glass-panel right-panel">
        <div className="panel-header">
          <h2><CheckCircle2 size={20} color="#10b981" /> Live Result</h2>
          <div className="header-actions">
            <input ref={importInputRef} type="file" accept=".yaml,.yml,.txt,text/yaml,text/plain" onChange={handleYamlImport} style={{ display: 'none' }} />
            <button className="btn-secondary" onClick={triggerYamlImport} style={{ padding: '0.5rem 0.9rem', fontSize: '0.875rem' }}><Upload size={16} /> Import</button>
            <button className="btn-icon" onClick={copyToClipboard} title="Copy to clipboard"><Copy size={18} /></button>
            <button className="btn-primary" onClick={downloadYaml} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}><Download size={16} /> Download</button>
          </div>
        </div>
        <div className="panel-content" style={{ padding: 0 }}>
          <pre className="yaml-preview">{generateYaml()}</pre>
        </div>
      </div>
    </div>
  );
}

export default App;