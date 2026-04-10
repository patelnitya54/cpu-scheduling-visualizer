// CPU Scheduling Visualizer
// This file keeps the code beginner-friendly by separating UI code,
// scheduling logic, and animation logic into small clear functions.

const processes = [];
const processColors = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#06b6d4",
];

const state = {
  simulationToken: 0,
  isRunning: false,
  isPaused: false,
  unitSteps: [],
  currentStep: 0,
  metrics: [],
  algorithmLabel: "",
  totalTime: 0,
};

// Cache DOM elements once so we can reuse them.
const processForm = document.getElementById("processForm");
const processIdInput = document.getElementById("processId");
const arrivalTimeInput = document.getElementById("arrivalTime");
const burstTimeInput = document.getElementById("burstTime");
const algorithmSelect = document.getElementById("algorithm");
const timeQuantumInput = document.getElementById("timeQuantum");
const contextSwitchInput = document.getElementById("contextSwitchTime");
const quantumGroup = document.getElementById("quantumGroup");
const speedSelect = document.getElementById("speed");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");

const errorMessage = document.getElementById("errorMessage");
const successMessage = document.getElementById("successMessage");
const processTableBody = document.getElementById("processTableBody");
const queueContainer = document.getElementById("queueContainer");
const cpuBox = document.getElementById("cpuBox");
const cpuProcessName = document.getElementById("cpuProcessName");
const cpuProcessMeta = document.getElementById("cpuProcessMeta");
const currentTimeText = document.getElementById("currentTime");
const ganttChart = document.getElementById("ganttChart");
const timeMarkers = document.getElementById("timeMarkers");
const resultsTableBody = document.getElementById("resultsTableBody");
const avgWaiting = document.getElementById("avgWaiting");
const avgTurnaround = document.getElementById("avgTurnaround");

processForm.addEventListener("submit", handleAddProcess);
algorithmSelect.addEventListener("change", toggleQuantumField);
startBtn.addEventListener("click", startSimulation);
pauseBtn.addEventListener("click", togglePauseResume);
resetBtn.addEventListener("click", resetAll);

toggleQuantumField();
renderProcessTable();
renderQueue(null, new Set(), 0, "idle");

function handleAddProcess(event) {
  event.preventDefault();
  clearMessages();

  const id = processIdInput.value.trim();
  const arrivalText = arrivalTimeInput.value.trim();
  const burstText = burstTimeInput.value.trim();
  const arrival = Number(arrivalText);
  const burst = Number(burstText);

  console.log("Add Process Debug:", {
    id,
    arrivalText,
    burstText,
    parsedArrival: arrival,
    parsedBurst: burst,
  });

  if (!id) {
    showError("Please enter a Process ID.");
    return;
  }

  if (processes.some((process) => process.id.toLowerCase() === id.toLowerCase())) {
    showError("Process ID must be unique. Try a different name like P2 or P3.");
    return;
  }

  if (
    arrivalText === "" ||
    Number.isNaN(arrival) ||
    !Number.isInteger(arrival) ||
    arrival < 0
  ) {
    showError("Arrival Time must be a whole number greater than or equal to 0.");
    return;
  }

  if (
    burstText === "" ||
    Number.isNaN(burst) ||
    !Number.isInteger(burst) ||
    burst <= 0
  ) {
    showError("Burst Time must be a whole number greater than 0.");
    return;
  }

  processes.push({
    id,
    arrival,
    burst,
    color: processColors[processes.length % processColors.length],
    order: processes.length,
  });

  renderProcessTable();
  renderQueue(null, new Set(), 0, "idle");
  processForm.reset();
  toggleQuantumField();
  showSuccess(`Process ${id} added successfully.`);
}

function toggleQuantumField() {
  quantumGroup.classList.toggle("hidden", algorithmSelect.value !== "rr");
}

function renderProcessTable() {
  if (processes.length === 0) {
    processTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-text">No processes added yet.</td>
      </tr>
    `;
    return;
  }

  processTableBody.innerHTML = processes
    .map(
      (process) => `
        <tr>
          <td>${process.id}</td>
          <td>${process.arrival}</td>
          <td>${process.burst}</td>
          <td><span class="color-preview" style="background:${process.color}"></span></td>
        </tr>
      `
    )
    .join("");
}

function startSimulation() {
  clearMessages();

  if (processes.length === 0) {
    showError("Add at least one process before starting the simulation.");
    return;
  }

  const algorithm = algorithmSelect.value;
  const quantum = Number(timeQuantumInput.value.trim());
  const contextSwitchTime = Number(contextSwitchInput.value.trim());

  if (algorithm === "rr" && (!Number.isInteger(quantum) || quantum <= 0)) {
    showError("Round Robin needs a valid time quantum greater than 0.");
    return;
  }

  if (
    contextSwitchInput.value.trim() === "" ||
    Number.isNaN(contextSwitchTime) ||
    !Number.isInteger(contextSwitchTime) ||
    contextSwitchTime < 0
  ) {
    showError("Context Switch Time must be a whole number greater than or equal to 0.");
    return;
  }

  const scheduleResult = buildSchedule(
    processes.map((process) => ({ ...process })),
    algorithm,
    quantum,
    contextSwitchTime
  );

  console.log("Schedule Debug:", scheduleResult);
  console.table(scheduleResult.metrics);

  state.simulationToken += 1;
  state.isRunning = true;
  state.isPaused = false;
  state.currentStep = 0;
  state.unitSteps = scheduleResult.unitSteps;
  state.metrics = scheduleResult.metrics;
  state.algorithmLabel = scheduleResult.algorithmLabel;
  state.totalTime = scheduleResult.totalTime;

  pauseBtn.disabled = false;
  pauseBtn.textContent = "Pause";
  resetVisualization();
  fillResults(scheduleResult.metrics);
  runAnimation(state.simulationToken);
}

function buildSchedule(processList, algorithm, quantum, contextSwitchTime) {
  switch (algorithm) {
    case "fcfs":
      return runFCFS(processList, contextSwitchTime);
    case "sjf":
      return runSJF(processList, contextSwitchTime);
    case "rr":
      return runRoundRobin(processList, quantum, contextSwitchTime);
    default:
      return runFCFS(processList, contextSwitchTime);
  }
}

// FCFS: the CPU picks the earliest arrived process and runs it fully.
function runFCFS(processList, contextSwitchTime) {
  const sorted = [...processList].sort(sortByArrivalThenOrder);
  const segments = [];
  const completionMap = new Map();
  let currentTime = 0;
  let lastRunningProcessId = null;

  sorted.forEach((process) => {
    if (currentTime < process.arrival) {
      addIdleSegment(segments, currentTime, process.arrival);
      currentTime = process.arrival;
      lastRunningProcessId = null;
    }

    if (lastRunningProcessId && lastRunningProcessId !== process.id) {
      currentTime = addContextSwitchSegment(segments, currentTime, contextSwitchTime);
    }

    addExecutionSegment(segments, process, currentTime, process.burst);
    currentTime += process.burst;
    completionMap.set(process.id, currentTime);
    lastRunningProcessId = process.id;
  });

  return finalizeSchedule(processList, segments, completionMap, "FCFS");
}

// SJF (non-preemptive): among arrived processes, pick the one with the shortest burst.
function runSJF(processList, contextSwitchTime) {
  const sorted = [...processList].sort(sortByArrivalThenOrder);
  const segments = [];
  const completionMap = new Map();
  const completed = new Set();
  let currentTime = 0;
  let lastRunningProcessId = null;

  while (completed.size < sorted.length) {
    const ready = sorted
      .filter((process) => process.arrival <= currentTime && !completed.has(process.id))
      .sort((a, b) => a.burst - b.burst || sortByArrivalThenOrder(a, b));

    if (ready.length === 0) {
      const nextArrival = sorted.find((process) => !completed.has(process.id)).arrival;
      addIdleSegment(segments, currentTime, nextArrival);
      currentTime = nextArrival;
      lastRunningProcessId = null;
      continue;
    }

    const currentProcess = ready[0];

    if (lastRunningProcessId && lastRunningProcessId !== currentProcess.id) {
      currentTime = addContextSwitchSegment(segments, currentTime, contextSwitchTime);
    }

    addExecutionSegment(segments, currentProcess, currentTime, currentProcess.burst);
    currentTime += currentProcess.burst;
    completionMap.set(currentProcess.id, currentTime);
    completed.add(currentProcess.id);
    lastRunningProcessId = currentProcess.id;
  }

  return finalizeSchedule(processList, segments, completionMap, "SJF (Non-preemptive)");
}

// Round Robin: each arrived process gets up to one time quantum before moving to the back.
function runRoundRobin(processList, quantum, contextSwitchTime) {
  const sorted = processList
    .map(p => ({ ...p, remaining: p.burst }))
    .sort(sortByArrivalThenOrder);

  const segments = [];
  const completionMap = new Map();
  const readyQueue = [];

  let time = 0;
  let i = 0;
  let lastProcess = null;

  while (completionMap.size < sorted.length) {

    // Add processes that have arrived
    while (i < sorted.length && sorted[i].arrival <= time) {
      readyQueue.push(sorted[i]);
      i++;
    }

    // If queue empty → jump to next arrival
    if (readyQueue.length === 0) {
      if (i < sorted.length) {
        addIdleSegment(segments, time, sorted[i].arrival);
        time = sorted[i].arrival;
        lastProcess = null;
        continue;
      } else break;
    }

    const current = readyQueue.shift();

    // Context switch (only if different process)
    if (lastProcess && lastProcess !== current.id) {
      time = addContextSwitchSegment(segments, time, contextSwitchTime);
    }

    const execTime = Math.min(quantum, current.remaining);

    addExecutionSegment(segments, current, time, execTime);

    time += execTime;
    current.remaining -= execTime;

    // Add newly arrived processes during execution
    while (i < sorted.length && sorted[i].arrival <= time) {
      readyQueue.push(sorted[i]);
      i++;
    }

    if (current.remaining > 0) {
      readyQueue.push(current);
    } else {
      completionMap.set(current.id, time);
    }

    lastProcess = current.id;
  }

  return finalizeSchedule(
    processList,
    segments,
    completionMap,
    `Round Robin (q = ${quantum})`
  );
}

function enqueueArrivals(sorted, arrivalIndex, readyQueue, currentTime) {
  let nextIndex = arrivalIndex;

  while (nextIndex < sorted.length && sorted[nextIndex].arrival <= currentTime) {
    readyQueue.push(sorted[nextIndex]);
    nextIndex += 1;
  }

  return nextIndex;
}

function addIdleSegment(segments, start, end) {
  if (end <= start) {
    return;
  }

  mergeSegment(segments, {
    type: "idle",
    processId: null,
    label: "Idle",
    start,
    end,
    color: "#4b5563",
  });
}

function addContextSwitchSegment(segments, start, duration) {
  if (duration <= 0) {
    return start;
  }

  mergeSegment(segments, {
    type: "context",
    processId: null,
    label: "CS",
    start,
    end: start + duration,
    color: "#f59e0b",
  });

  return start + duration;
}

function addExecutionSegment(segments, process, start, duration) {
  if (duration <= 0) {
    return;
  }

  mergeSegment(segments, {
    type: "process",
    processId: process.id,
    label: process.id,
    start,
    end: start + duration,
    color: process.color,
  });
}

// Merge adjacent blocks when they represent the same continuous activity.
function mergeSegment(segments, nextSegment) {
  const lastSegment = segments[segments.length - 1];

  if (
    lastSegment &&
    lastSegment.type === nextSegment.type &&
    lastSegment.processId === nextSegment.processId &&
    lastSegment.end === nextSegment.start
  ) {
    lastSegment.end = nextSegment.end;
    return;
  }

  segments.push(nextSegment);
}

function finalizeSchedule(processList, segments, completionMap, algorithmLabel) {
  const metrics = processList
    .map((process) => {
      const completion = completionMap.get(process.id);
      const turnaround = completion - process.arrival;
      const waiting = turnaround - process.burst;

      return {
        id: process.id,
        arrival: process.arrival,
        burst: process.burst,
        completion,
        turnaround,
        waiting,
        color: process.color,
        order: process.order,
      };
    })
    .sort((a, b) => a.order - b.order);

  const unitSteps = expandSegmentsToUnitSteps(segments);
  const totalTime = segments.length === 0 ? 0 : segments[segments.length - 1].end;

  return {
    algorithmLabel,
    segments,
    unitSteps,
    metrics,
    totalTime,
  };
}

function expandSegmentsToUnitSteps(segments) {
  const unitSteps = [];

  segments.forEach((segment) => {
    for (let time = segment.start; time < segment.end; time += 1) {
      unitSteps.push({
        time,
        type: segment.type,
        activeProcessId: segment.processId,
        label: segment.label,
        color: segment.color,
      });
    }
  });

  return unitSteps;
}

async function runAnimation(token) {
  const completedSet = new Set();
  const remainingBurstMap = new Map(processes.map((process) => [process.id, process.burst]));

  while (state.currentStep < state.unitSteps.length && state.isRunning && token === state.simulationToken) {
    if (state.isPaused) {
      await delay(100);
      continue;
    }

    const step = state.unitSteps[state.currentStep];

    if (step.type === "process") {
      const nextRemaining = remainingBurstMap.get(step.activeProcessId) - 1;
      remainingBurstMap.set(step.activeProcessId, nextRemaining);

      if (nextRemaining === 0) {
        completedSet.add(step.activeProcessId);
      }
    }

    updateCurrentTime(step.time);
    updateCPU(step);
    renderQueue(step.activeProcessId, completedSet, step.time, step.type);
    appendGanttStep(step);

    state.currentStep += 1;
    await delay(Number(speedSelect.value));
  }

  if (token !== state.simulationToken) {
    return;
  }

  if (state.currentStep >= state.unitSteps.length) {
    updateCurrentTime(state.totalTime);
    updateCPU({ type: "idle", activeProcessId: null, time: state.totalTime });
    renderQueue(null, new Set(processes.map((process) => process.id)), state.totalTime, "idle");
    showSuccess(`Simulation finished using ${state.algorithmLabel}.`);
    state.isRunning = false;
    state.isPaused = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
  }
}

function updateCurrentTime(time) {
  currentTimeText.textContent = time;
}

function updateCPU(step) {
  if (step.type === "context") {
    cpuBox.classList.remove("active");
    cpuBox.style.borderColor = "#f59e0b";
    cpuProcessName.textContent = "Context Switch";
    cpuProcessMeta.textContent = `Switching at time ${step.time}.`;
    return;
  }

  if (step.type !== "process") {
    cpuBox.classList.remove("active");
    cpuBox.style.borderColor = "rgba(148, 163, 184, 0.2)";
    cpuProcessName.textContent = "Idle";
    cpuProcessMeta.textContent = `No process is running at time ${step.time}.`;
    return;
  }

  const process = processes.find((item) => item.id === step.activeProcessId);
  cpuBox.classList.add("active");
  cpuBox.style.borderColor = process.color;
  cpuProcessName.textContent = process.id;
  cpuProcessMeta.textContent = `Running at time ${step.time}. Remaining work is being simulated step by step.`;
}

function renderQueue(activeId, completedSet, time = 0, stepType = "idle") {
  const waitingProcesses = processes.filter((process) => {
    const hasArrived = process.arrival <= time;
    const isCompleted = completedSet.has(process.id);
    const isRunning = stepType === "process" && process.id === activeId;
    return hasArrived && !isCompleted && !isRunning;
  });

  if (waitingProcesses.length === 0) {
    queueContainer.innerHTML = `<div class="empty-state">No waiting process in the ready queue.</div>`;
    return;
  }

  queueContainer.innerHTML = waitingProcesses
    .map(
      (process) => `
        <div class="process-box waiting" style="background:${process.color}">
          <strong>${process.id}</strong>
          <small>Arrival: ${process.arrival}</small>
          <small>Burst: ${process.burst}</small>
        </div>
      `
    )
    .join("");
}

function appendGanttStep(step) {
  const label = step.type === "process" ? step.activeProcessId : step.label;
  const segmentClass = step.type === "context" ? "context-switch" : step.type;
  const lastSegment = ganttChart.lastElementChild;

  if (
    lastSegment &&
    lastSegment.dataset.type === step.type &&
    lastSegment.dataset.label === label
  ) {
    const nextEnd = Number(lastSegment.dataset.endTime) + 1;
    lastSegment.dataset.endTime = `${nextEnd}`;
    lastSegment.querySelector(".segment-time").textContent = `${lastSegment.dataset.startTime} - ${nextEnd}`;
  } else {
    const segment = document.createElement("div");
    segment.className = `gantt-segment ${segmentClass}`;
    segment.dataset.type = step.type;
    segment.dataset.label = label;
    segment.dataset.startTime = `${step.time}`;
    segment.dataset.endTime = `${step.time + 1}`;
    segment.style.background = buildSegmentBackground(step);
    segment.innerHTML = `
      <strong>${label}</strong>
      <span class="segment-time">${step.time} - ${step.time + 1}</span>
    `;
    ganttChart.appendChild(segment);
  }

  rebuildTimeMarkers();
}

function buildSegmentBackground(step) {
  if (step.type === "context") {
    return "linear-gradient(135deg, #f59e0b, #d97706)";
  }

  if (step.type === "idle") {
    return "linear-gradient(135deg, #4b5563, #374151)";
  }

  return `linear-gradient(135deg, ${step.color}, ${adjustColor(step.color, -25)})`;
}

function fillResults(metrics) {
  if (metrics.length === 0) {
    resultsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-text">Run a simulation to see results.</td>
      </tr>
    `;
    avgWaiting.textContent = "0";
    avgTurnaround.textContent = "0";
    return;
  }

  let totalWaiting = 0;
  let totalTurnaround = 0;

  resultsTableBody.innerHTML = metrics
    .map((item) => {
      totalWaiting += item.waiting;
      totalTurnaround += item.turnaround;

      return `
        <tr>
          <td>${item.id}</td>
          <td>${item.arrival}</td>
          <td>${item.burst}</td>
          <td>${item.completion}</td>
          <td>${item.turnaround}</td>
          <td>${item.waiting}</td>
        </tr>
      `;
    })
    .join("");

  avgWaiting.textContent = (totalWaiting / metrics.length).toFixed(2);
  avgTurnaround.textContent = (totalTurnaround / metrics.length).toFixed(2);
}

function togglePauseResume() {
  if (!state.isRunning) {
    return;
  }

  state.isPaused = !state.isPaused;
  pauseBtn.textContent = state.isPaused ? "Resume" : "Pause";
  showSuccess(state.isPaused ? "Simulation paused." : "Simulation resumed.");
}

function resetVisualization() {
  ganttChart.innerHTML = "";
  timeMarkers.innerHTML = "";
  updateCurrentTime(0);
  cpuBox.classList.remove("active");
  cpuBox.style.borderColor = "rgba(148, 163, 184, 0.2)";
  cpuProcessName.textContent = "Idle";
  cpuProcessMeta.textContent = "Waiting to start...";
  renderQueue(null, new Set(), 0, "idle");
}

function resetAll() {
  state.simulationToken += 1;
  state.isRunning = false;
  state.isPaused = false;
  state.unitSteps = [];
  state.currentStep = 0;
  state.metrics = [];
  state.totalTime = 0;

  pauseBtn.disabled = true;
  pauseBtn.textContent = "Pause";

  resetVisualization();
  fillResults([]);
  clearMessages();
  showSuccess("Simulation state reset. Your process list is still available.");
}

function sortByArrivalThenOrder(a, b) {
  return a.arrival - b.arrival || a.order - b.order;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
  successMessage.classList.add("hidden");
}

function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.classList.remove("hidden");
  errorMessage.classList.add("hidden");
}

function clearMessages() {
  errorMessage.classList.add("hidden");
  successMessage.classList.add("hidden");
}

function rebuildTimeMarkers() {
  const segments = [...ganttChart.children];
  timeMarkers.innerHTML = "";

  if (segments.length === 0) {
    return;
  }

  segments.forEach((segment, index) => {
    const marker = document.createElement("span");
    marker.textContent = segment.dataset.startTime;
    timeMarkers.appendChild(marker);

    if (index === segments.length - 1) {
      const endMarker = document.createElement("span");
      endMarker.textContent = segment.dataset.endTime;
      timeMarkers.appendChild(endMarker);
    }
  });
}

// A small helper to create a darker shade for gradient backgrounds.
function adjustColor(hexColor, amount) {
  const color = hexColor.replace("#", "");
  const number = parseInt(color, 16);
  const red = Math.max(0, Math.min(255, (number >> 16) + amount));
  const green = Math.max(0, Math.min(255, ((number >> 8) & 0x00ff) + amount));
  const blue = Math.max(0, Math.min(255, (number & 0x0000ff) + amount));

  return `rgb(${red}, ${green}, ${blue})`;
}
