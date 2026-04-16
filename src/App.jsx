import React, { useState, useEffect, useCallback } from 'react';
import yaml from 'js-yaml';
import { Download, Plus, Trash2, Copy, Pointer, Sparkles, CheckCircle2, ChevronRight, Save } from 'lucide-react';
import './index.css';

const STEP_METADATA = {
  aiTap: {
    label: 'Click / Tap',
    description: 'Use AI to find and click an element by description.',
    example: "aiTap: \"the Delete button next to user 'user1'\""
  },
  aiInput: {
    label: 'Input / Type',
    description: 'Type text into a field found by AI.',
    example: "aiInput: \"the Search field\" \n  value: \"John Doe\""
  },
  aiKeyboardPress: {
    label: 'Press Key',
    description: 'Simulate a specific key press (like Enter or Tab).',
    example: "aiKeyboardPress: \"Press Enter to submit the form\" \n  keyName: \"Enter\""
  },
  aiAssert: {
    label: 'Assert / Verify',
    description: 'Confirm if an element or text is present on the page.',
    example: "aiAssert: \"The user 'abc' is visible in the list\""
  },
  aiQuery: {
    label: 'Query / Extract',
    description: 'Extract information or data from the page using natural language.',
    example: "aiQuery: \"Return the phone number of the user in the first row\""
  },
  aiWaitFor: {
    label: 'Wait For',
    description: 'Wait until a specific element or text appears.',
    example: "aiWaitFor: \"the success toast notification\" \n  timeout: 10000"
  },
  sleep: {
    label: 'Sleep / Delay',
    description: 'Wait for a specific duration in milliseconds.',
    example: "sleep: 2000 # Wait for 2 seconds"
  },
  javascript: {
    label: 'JS Script',
    description: 'Run custom JavaScript code in the browser context.',
    example: "javascript: document.querySelector('button').click()"
  }
};

const STEP_TYPES = Object.keys(STEP_METADATA);


function App() {
  const [config, setConfig] = useState({
    web: {
      url: '${APP_URL}',
      viewportWidth: 1280,
      viewportHeight: 800,
    },
    agent: {
      groupName: 'My Tests',
      generateReport: true
    }
  });

  const [tasks, setTasks] = useState([
    {
      id: crypto.randomUUID(),
      name: 'My First Test',
      flow: [
        { id: crypto.randomUUID(), type: 'aiTap', instruction: 'the Login button', xpath: '' }
      ]
    }
  ]);

  const [activeTaskId, setActiveTaskId] = useState(tasks[0].id);
  const [activeStepId, setActiveStepId] = useState(null);
  const [xpathConnection, setXpathConnection] = useState('Listening for XPath...');
  const [wsConnected, setWsConnected] = useState(true);

  const activeStepIdRef = React.useRef(activeStepId);

  useEffect(() => {
    activeStepIdRef.current = activeStepId;
  }, [activeStepId]);

  useEffect(() => {
    if (import.meta.hot) {
      const handleXPathEvent = (data) => {
        setXpathConnection(`Received: ${data.xpath} at ${new Date().toLocaleTimeString()}`);
        setTasks(prevTasks => {
          return prevTasks.map(task => {
            return {
              ...task,
              flow: task.flow.map(step => {
                if (step.id === activeStepIdRef.current && step.type !== 'sleep' && step.type !== 'javascript') {
                  return { ...step, xpath: data.xpath };
                }
                return step;
              })
            };
          });
        });
      };

      // In Vite, to avoid duplicate event listeners on HMR or re-renders
      // we must use a single listener attached once!
      // However, Vite's import.meta.hot doesn't cleanly support .off() in all environments,
      // so we use a flag to disable duplicated triggers if it somehow runs twice.
      import.meta.hot.on('xpath:received', handleXPathEvent);
    } else {
      setWsConnected(false);
    }
  }, []);

  const updateConfig = (section, field, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const addTask = () => {
    const newTask = {
      id: crypto.randomUUID(),
      name: 'New Test Task',
      flow: []
    };
    setTasks([...tasks, newTask]);
    setActiveTaskId(newTask.id);
  };

  const removeTask = (taskId) => {
    const newTasks = tasks.filter(t => t.id !== taskId);
    setTasks(newTasks);
    if (activeTaskId === taskId && newTasks.length > 0) {
      setActiveTaskId(newTasks[0].id);
    }
  };

  const updateTaskTarget = (taskId, newName) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, name: newName } : t));
  };

  const addStep = (taskId, type = 'aiTap') => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newStep = { id: crypto.randomUUID(), type, instruction: '', xpath: '', value: '' };
        if (type === 'sleep') newStep.value = 1000;
        setActiveStepId(newStep.id);
        return { ...t, flow: [...t.flow, newStep] };
      }
      return t;
    }));
  };

  const updateStep = (taskId, stepId, field, value) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          flow: t.flow.map(s => s.id === stepId ? { ...s, [field]: value } : s)
        };
      }
      return t;
    }));
  };

  const removeStep = (taskId, stepId) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, flow: t.flow.filter(s => s.id !== stepId) };
      }
      return t;
    }));
  };

  const generateYaml = () => {
    const obj = {
      web: config.web,
      agent: config.agent,
      tasks: tasks.map(t => ({
        name: t.name,
        flow: t.flow.map(s => {
          const stepObj = {};
          
          if (s.type === 'sleep') {
            return { sleep: parseInt(s.value) || 1000 };
          }
          if (s.type === 'javascript') {
            return { javascript: s.value };
          }

          // Dynamic key for aiTap, aiInput, etc
          stepObj[s.type] = s.instruction || "target element";
          
          if (s.xpath) stepObj.xpath = s.xpath;
          if (s.type === 'aiInput' && s.value) stepObj.value = s.value;
          if (s.type === 'aiKeyboardPress' && s.value) stepObj.keyName = s.value;
          if (s.type === 'aiWaitFor' && s.value) stepObj.timeout = parseInt(s.value);
          
          return stepObj;
        })
      }))
    };
    return '# Generated by Midscene AI Builder\n\n' + yaml.dump(obj, { sortKeys: false, lineWidth: -1 });
  };

  const downloadYaml = () => {
    const blob = new Blob([generateYaml()], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateYaml());
  };

  const bookmarkletCode = `javascript:(function(){document.body.style.cursor='crosshair';let handler=function(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();function getXPath(el){if(!el||el.nodeType!==1)return'';if(el.id)return'//*[@id="'+el.id+'"]';if(el===document.body)return'/html/body';if(!el.parentNode||!el.parentNode.childNodes)return'';let ix=0,siblings=el.parentNode.childNodes;for(let i=0;i<siblings.length;i++){let sibling=siblings[i];if(sibling===el){let parentPath=getXPath(el.parentNode);return parentPath+'/'+el.tagName.toLowerCase()+'['+(ix+1)+']';}if(sibling.nodeType===1&&sibling.tagName===el.tagName)ix++;}return'';}try{let xpath=getXPath(e.target);fetch('${window.location.protocol}//${window.location.host}/api/xpath',{method:'POST',body:JSON.stringify({xpath})}).catch(()=>alert('Ensure the Yaml builder is running on ${window.location.host}'));}catch(err){console.error('XPath extraction error:',err);}finally{document.removeEventListener('click',handler,true);document.body.style.cursor='default';}};document.addEventListener('click',handler,true);})();`;

  const bookmarkletRef = React.useRef(null);

  useEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute('href', bookmarkletCode);
    }
  }, [bookmarkletCode]);

  const activeTask = tasks.find(t => t.id === activeTaskId) || tasks[0];

  return (
    <div className="app-container">
      {/* LEFT PANEL: Form Editor */}
      <div className="glass-panel left-panel">
        <div className="panel-header">
          <h2><Sparkles size={20} color="var(--primary-color)" /> Midscene AI Test Builder</h2>
          <div className="header-actions">
            {!wsConnected && <span style={{ color: '#ef4444', fontSize: '12px' }}>Dev Server Only</span>}
            {wsConnected && (
              <div className="xpath-connected">
                <div className="xpath-pulse"></div>
                {xpathConnection}
              </div>
            )}
          </div>
        </div>

        <div className="panel-content">
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
              <input 
                type="text" 
                value={config.web.url} 
                onChange={e => updateConfig('web', 'url', e.target.value)} 
                placeholder="e.g. \${APP_URL} or https://example.com"
              />
            </div>
            <div style={{ width: '150px' }}>
              <label>Group Name</label>
              <input 
                type="text" 
                value={config.agent.groupName} 
                onChange={e => updateConfig('agent', 'groupName', e.target.value)} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2rem 0 1rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Test Tasks</h3>
            <button className="btn-secondary" style={{ padding: '0.5rem', fontSize: '0.875rem' }} onClick={addTask}>
              <Plus size={16} /> Add Task
            </button>
          </div>

          {tasks.map(task => (
            <div key={task.id} className={`task-card ${(activeTaskId === task.id) ? 'active' : ''}`} onClick={() => setActiveTaskId(task.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={task.name} 
                  onChange={e => updateTaskTarget(task.id, e.target.value)}
                  style={{ background: 'transparent', border: 'none', padding: 0, fontSize: '1rem', fontWeight: 'bold' }}
                />
                <button className="btn-icon btn-danger" onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}>
                  <Trash2 size={16} />
                </button>
              </div>

              {activeTaskId === task.id && (
                <div style={{ marginTop: '1rem' }}>
                  {task.flow.map((step, idx) => (
                    <div key={step.id} className="step-card" onClick={(e) => { e.stopPropagation(); setActiveStepId(step.id); }} style={{ borderColor: activeStepId === step.id ? 'var(--primary-color)' : 'var(--border-color)' }}>
                      <div className="step-header">
                        <span className="step-type-badge">{idx + 1}. {STEP_METADATA[step.type]?.label || step.type}</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <select 
                            value={step.type} 
                            onChange={e => updateStep(task.id, step.id, 'type', e.target.value)}
                            style={{ width: 'auto', padding: '0.25rem', fontSize: '0.75rem', height: 'auto' }}
                          >
                            {STEP_TYPES.map(t => <option key={t} value={t}>{STEP_METADATA[t].label}</option>)}
                          </select>
                          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); removeStep(task.id, step.id); }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="step-description">
                        {STEP_METADATA[step.type]?.description}
                      </div>
                      <div className="step-example">
                        Example: <code>{STEP_METADATA[step.type]?.example}</code>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                        {step.type !== 'sleep' && step.type !== 'javascript' && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div style={{ flex: 1 }}>
                              <input 
                                type="text" 
                                placeholder="What to tell AI? (e.g. 'the Login Button')"
                                value={step.instruction}
                                onChange={e => updateStep(task.id, step.id, 'instruction', e.target.value)}
                                style={{ fontSize: '0.875rem' }}
                              />
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', paddingRight: '0.5rem' }}>
                              <input 
                                type="text" 
                                placeholder="Optional: Target XPath"
                                value={step.xpath}
                                onChange={e => updateStep(task.id, step.id, 'xpath', e.target.value)}
                                style={{ fontSize: '0.875rem', border: 'none', background: 'transparent' }}
                              />
                              <Pointer size={16} color={activeStepId === step.id ? 'var(--primary-color)' : 'var(--text-muted)'} title="Use Bookmarklet while this step is selected to auto-fill" />
                            </div>
                          </div>
                        )}

                        {step.type === 'aiInput' && (
                          <div>
                            <input 
                              type="text" 
                              placeholder="Value to input (e.g. \${USERNAME})"
                              value={step.value}
                              onChange={e => updateStep(task.id, step.id, 'value', e.target.value)}
                            />
                          </div>
                        )}

                        {step.type === 'aiKeyboardPress' && (
                          <div>
                            <input 
                              type="text" 
                              placeholder="Key Name (e.g. Enter)"
                              value={step.value}
                              onChange={e => updateStep(task.id, step.id, 'value', e.target.value)}
                            />
                          </div>
                        )}

                       {step.type === 'aiWaitFor' && (
                          <div>
                            <input 
                              type="number" 
                              placeholder="Timeout in ms (e.g. 5000)"
                              value={step.value}
                              onChange={e => updateStep(task.id, step.id, 'value', e.target.value)}
                            />
                          </div>
                        )}

                        {step.type === 'sleep' && (
                          <div>
                            <input 
                              type="number" 
                              placeholder="Sleep in ms (e.g. 1000)"
                              value={step.value}
                              onChange={e => updateStep(task.id, step.id, 'value', e.target.value)}
                            />
                          </div>
                        )}

                        {step.type === 'javascript' && (
                          <div>
                            <input 
                              type="text" 
                              placeholder="JS code to evaluate"
                              value={step.value}
                              onChange={e => updateStep(task.id, step.id, 'value', e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <button className="btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => addStep(task.id)}>
                    <Plus size={16} /> Add Step to Task
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: YAML Preview */}
      <div className="glass-panel right-panel">
        <div className="panel-header">
          <h2><CheckCircle2 size={20} color="#10b981" /> Live Result</h2>
          <div className="header-actions">
            <button className="btn-icon" onClick={copyToClipboard} title="Copy to clipboard">
              <Copy size={18} />
            </button>
            <button className="btn-primary" onClick={downloadYaml} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
              <Download size={16} /> Download
            </button>
          </div>
        </div>
        <div className="panel-content" style={{ padding: 0 }}>
          <pre className="yaml-preview">
            {generateYaml()}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;
