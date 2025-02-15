'use client';
import { useState, useEffect, useRef } from "react";

// Define our instruction types.
type Instruction =
  | { id: number; type: "time"; time: number }
  | { id: number; type: "repeat"; times: number };

// A helper type for time-only instructions.
type TimeInstruction = Extract<Instruction, { type: "time" }>;

type SavedTimer = {
  id: number;
  name: string;
  instructions: Instruction[];
};

export default function Home() {
  /*** INSTRUCTIONS BUILDER ***/
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [timeInput, setTimeInput] = useState("");
  const [repeatInput, setRepeatInput] = useState<number>(1);
  const instructionIdRef = useRef(0);
  // Used to prevent multiple prompts at once.
  const editingRef = useRef(false);

  // Helper: Format seconds into HH:MM:SS.
  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Helper: Parse a time string (HH:MM:SS, MM:SS, or SS) into seconds.
  const parseTimeInput = (input: string): number | null => {
    const parts = input.split(":").map((s) => parseInt(s, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) {
      const [hrs, mins, secs] = parts;
      return hrs * 3600 + mins * 60 + secs;
    } else if (parts.length === 2) {
      const [mins, secs] = parts;
      return mins * 60 + secs;
    } else if (parts.length === 1) {
      return parts[0];
    }
    return null;
  };

  // Add a new time instruction.
  const addTimeInstruction = () => {
    const seconds = parseTimeInput(timeInput);
    if (seconds === null || seconds <= 0) return;
    const newInst: Instruction = {
      id: instructionIdRef.current++,
      type: "time",
      time: seconds,
    };
    setInstructions((prev) => [...prev, newInst]);
    setTimeInput("");
  };

  // Add a new repeat instruction.
  const addRepeatInstruction = () => {
    // Only allow a repeat if there is at least one time instruction.
    if (!instructions.some((inst) => inst.type === "time")) return;
    const newInst: Instruction = {
      id: instructionIdRef.current++,
      type: "repeat",
      times: repeatInput,
    };
    setInstructions((prev) => [...prev, newInst]);
  };

  // Edit an instruction.
  const editInstruction = (id: number) => {
    if (editingRef.current) return; // Prevent multiple prompts.
    editingRef.current = true;
    setInstructions((prev) =>
      prev.map((inst) => {
        if (inst.id === id) {
          if (inst.type === "time") {
            const currentTime = formatTime(inst.time);
            const newTimeStr = window.prompt("Edit time (HH:MM:SS):", currentTime);
            if (newTimeStr) {
              const newSeconds = parseTimeInput(newTimeStr);
              if (newSeconds !== null && newSeconds > 0) {
                editingRef.current = false;
                return { ...inst, time: newSeconds };
              }
            }
          } else if (inst.type === "repeat") {
            const newRepeatStr = window.prompt("Edit repeat count:", inst.times.toString());
            if (newRepeatStr) {
              const newRepeat = parseInt(newRepeatStr, 10);
              if (!isNaN(newRepeat) && newRepeat > 0) {
                editingRef.current = false;
                return { ...inst, times: newRepeat };
              }
            }
          }
        }
        return inst;
      })
    );
    editingRef.current = false;
  };

  // Delete an instruction.
  const deleteInstruction = (id: number) => {
    setInstructions((prev) => prev.filter((inst) => inst.id !== id));
  };

  /**
   * New flattening logic:
   * Process instructions sequentially. For each time instruction, append it.
   * For each repeat instruction, take the entire flattened sequence so far and append it
   * repeat.times times.
   */
  const flattenInstructionsEntire = (instrs: Instruction[]): TimeInstruction[] => {
    const flattened: TimeInstruction[] = [];
    for (const inst of instrs) {
      if (inst.type === "time") {
        flattened.push(inst);
      } else if (inst.type === "repeat") {
        const copy = [...flattened];
        for (let i = 0; i < inst.times; i++) {
          flattened.push(...copy);
        }
      }
    }
    return flattened;
  };

  /*** PROGRAM EXECUTION ***/
  const [flattenedSequence, setFlattenedSequence] = useState<TimeInstruction[]>([]);
  const [programState, setProgramState] = useState<{ index: number; countdown: number }>({
    index: 0,
    countdown: 0,
  });
  const [isProgramRunning, setIsProgramRunning] = useState(false);
  const programIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Start the program.
  const startProgram = () => {
    const sequence = flattenInstructionsEntire(instructions);
    if (sequence.length === 0) return;
    setFlattenedSequence(sequence);
    setProgramState({ index: 0, countdown: sequence[0].time });
    setIsProgramRunning(true);
  };

  const stopProgram = () => {
    setIsProgramRunning(false);
    if (programIntervalRef.current) clearInterval(programIntervalRef.current);
  };

  // Allow editing the current instruction while running.
  const editCurrentInstruction = () => {
    if (!isProgramRunning) return;
    const currentInst = flattenedSequence[programState.index];
    const currentTime = formatTime(currentInst.time);
    const newTimeStr = window.prompt("Edit current instruction time (HH:MM:SS):", currentTime);
    if (newTimeStr) {
      const newSeconds = parseTimeInput(newTimeStr);
      if (newSeconds !== null && newSeconds > 0) {
        setFlattenedSequence((prev) => {
          const newArr = [...prev];
          newArr[programState.index] = { ...newArr[programState.index], time: newSeconds };
          return newArr;
        });
        setProgramState((prev) => ({ ...prev, countdown: newSeconds }));
      }
    }
  };

  // Countdown loop.
  useEffect(() => {
    if (isProgramRunning) {
      programIntervalRef.current = window.setInterval(() => {
        setProgramState((prev) => {
          if (prev.countdown > 0) {
            return { ...prev, countdown: prev.countdown - 1 };
          } else {
            if (audioRef.current) {
              audioRef.current
                .play()
                .catch((e) => console.error("Audio play failed", e));
            }
            const newIndex = prev.index + 1;
            if (newIndex < flattenedSequence.length) {
              return { index: newIndex, countdown: flattenedSequence[newIndex].time };
            } else {
              setIsProgramRunning(false);
              return prev;
            }
          }
        });
      }, 1000);
    }
    return () => {
      if (programIntervalRef.current) clearInterval(programIntervalRef.current);
    };
  }, [isProgramRunning, flattenedSequence]);

  /*** SAVED TIMERS ***/
  const [savedTimers, setSavedTimers] = useState<SavedTimer[]>([]);
  const [savedTimerName, setSavedTimerName] = useState("");
  const [loadedTimerId, setLoadedTimerId] = useState<number | null>(null);
  const savedTimerIdRef = useRef(0);

  // Load saved timers from localStorage.
  useEffect(() => {
    const stored = localStorage.getItem("savedTimers");
    if (stored) {
      try {
        setSavedTimers(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse saved timers", e);
      }
    }
  }, []);

  // Save timers to localStorage when they change.
  useEffect(() => {
    localStorage.setItem("savedTimers", JSON.stringify(savedTimers));
  }, [savedTimers]);

  // Save or update the current timer.
  const saveOrUpdateTimer = () => {
    if (!savedTimerName.trim() || instructions.length === 0) return;
    if (loadedTimerId !== null) {
      setSavedTimers((prev) =>
        prev.map((timer) =>
          timer.id === loadedTimerId
            ? { ...timer, name: savedTimerName, instructions: instructions }
            : timer
        )
      );
      setLoadedTimerId(null);
      setSavedTimerName("");
    } else {
      const newSaved: SavedTimer = {
        id: savedTimerIdRef.current++,
        name: savedTimerName,
        instructions: instructions,
      };
      setSavedTimers((prev) => [...prev, newSaved]);
      setSavedTimerName("");
    }
  };

  // Load a saved timer into the builder.
  const loadTimer = (timer: SavedTimer) => {
    setInstructions(timer.instructions);
    setSavedTimerName(timer.name);
    setLoadedTimerId(timer.id);
  };

  // Edit a saved timer's name.
  const editSavedTimer = (id: number) => {
    const newName = window.prompt("Edit timer name:");
    if (newName) {
      setSavedTimers((prev) =>
        prev.map((timer) => (timer.id === id ? { ...timer, name: newName } : timer))
      );
    }
  };

  // Delete a saved timer.
  const deleteSavedTimer = (id: number) => {
    setSavedTimers((prev) => prev.filter((timer) => timer.id !== id));
  };

  return (
    <div className="min-h-screen p-8 flex flex-col gap-8 items-center">
      {/* Audio element for notifications */}
      <audio ref={audioRef} src="/notification.mp3" />

      <h1 className="text-2xl font-bold">Super Timer Program</h1>

      {/* Builder UI (shown when not running) */}
      {!isProgramRunning && (
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-4 mb-4">
            {/* TIME INSTRUCTION */}
            <div>
              <label className="block mb-1">Time (HH:MM:SS):</label>
              <input
                type="text"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                placeholder="e.g. 00:01:30"
                className="border p-2 rounded w-full"
              />
              <button
                onClick={addTimeInstruction}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
              >
                Add Time Instruction
              </button>
            </div>

            {/* REPEAT INSTRUCTION */}
            <div>
              <label className="block mb-1">Repeat Count:</label>
              <input
                type="number"
                value={repeatInput}
                onChange={(e) =>
                  setRepeatInput(parseInt(e.target.value) || 1)
                }
                min="1"
                className="border p-2 rounded w-full"
              />
              <button
                onClick={addRepeatInstruction}
                className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
              >
                Add Repeat Instruction
              </button>
            </div>
          </div>

          {/* Instructions List */}
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Instructions List:</h2>
            {instructions.length === 0 && <p>No instructions added.</p>}
            <ol className="list-decimal list-inside">
              {instructions.map((inst) => (
                <li key={inst.id} className="flex items-center justify-between">
                  <span>
                    {inst.type === "time"
                      ? `Time: ${formatTime(inst.time)}`
                      : `Repeat previous instruction${inst.times > 1 ? "s" : ""} ${inst.times} time(s)`}
                  </span>
                  <span className="flex gap-2">
                    <button onClick={() => editInstruction(inst.id)} title="Edit">
                      📝
                    </button>
                    <button onClick={() => deleteInstruction(inst.id)} title="Delete">
                      🗑️
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Save/Update Timer Section */}
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              {loadedTimerId !== null ? "Update Loaded Timer" : "Save Current Timer"}
            </h2>
            <input
              type="text"
              value={savedTimerName}
              onChange={(e) => setSavedTimerName(e.target.value)}
              placeholder="Timer Name"
              className="border p-2 rounded w-full mb-2"
            />
            <button
              onClick={saveOrUpdateTimer}
              className="px-4 py-2 bg-indigo-500 text-white rounded"
            >
              {loadedTimerId !== null ? "Update Timer" : "Save Timer"}
            </button>
          </div>

          {/* Saved Timers List */}
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Saved Timers</h2>
            {savedTimers.length === 0 && <p>No saved timers.</p>}
            <ul className="list-disc list-inside">
              {savedTimers.map((timer) => (
                <li key={timer.id} className="flex items-center justify-between">
                  <span>{timer.name}</span>
                  <span className="flex gap-2">
                    <button onClick={() => loadTimer(timer)} title="Load">
                      🚀
                    </button>
                    <button onClick={() => editSavedTimer(timer.id)} title="Edit">
                      📝
                    </button>
                    <button onClick={() => deleteSavedTimer(timer.id)} title="Delete">
                      🗑️
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Program Controls */}
          <div className="flex gap-4">
            <button
              onClick={startProgram}
              className="px-4 py-2 bg-purple-600 text-white rounded"
            >
              Start Program
            </button>
            <button
              onClick={() => setInstructions([])}
              className="px-4 py-2 bg-gray-400 text-white rounded"
            >
              Clear Instructions
            </button>
          </div>
        </div>
      )}

      {/* Running Program UI */}
      {isProgramRunning && (
        <div className="flex flex-col items-center">
          <h2 className="text-xl font-semibold mb-2">Program Running</h2>
          <p className="text-lg">
            Instruction {programState.index + 1} of {flattenedSequence.length}
          </p>
          <p className="text-4xl font-mono">
            {formatTime(programState.countdown)}
          </p>
          <div className="flex gap-4 mt-4">
            <button
              onClick={editCurrentInstruction}
              className="px-4 py-2 bg-yellow-500 text-white rounded"
            >
              Edit Current Instruction
            </button>
            <button
              onClick={stopProgram}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              Stop Program
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
