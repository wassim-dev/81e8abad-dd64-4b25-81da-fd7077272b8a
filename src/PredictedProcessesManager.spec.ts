import { spawn } from 'child_process';

import { PredictedProcess } from './PredictedProcess';
import { PredictedProcessesManager } from './PredictedProcessesManager';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.useFakeTimers();

describe('PredictedProcessesManager', () => {
  test('should resolve after all processes exit successfully', async () => {
    const processes = [
      new PredictedProcess(1, 'echo "Process 1"'),
      new PredictedProcess(2, 'echo "Process 2"'),
      new PredictedProcess(3, 'echo "Process 3"'),
    ];
    const manager = new PredictedProcessesManager(processes);

    (spawn as jest.Mock).mockImplementation(() => ({
      on: (event: string, callback: Function) => {
        if (event === 'close') callback(0); // Simulate successful exit
      },
      kill: jest.fn(),
      removeAllListeners: jest.fn(),
    }));

    await expect(manager.runAll()).resolves.toBeUndefined();
  });

  test('should reject if an AbortSignal is triggered during execution', async () => {
    const processes = [
      new PredictedProcess(1, 'sleep 3'),
      new PredictedProcess(2, 'sleep 3'),
      new PredictedProcess(3, 'sleep 3'),
    ];
    const manager = new PredictedProcessesManager(processes);
    const controller = new AbortController();

    (spawn as jest.Mock).mockImplementation(() => ({
      on: () => {
        return new Promise((resolve) => {
          setTimeout(resolve, 3000); // Resolve after 3 seconds
        });
      },
      kill: jest.fn(),
      removeAllListeners: jest.fn(),
    }));

    jest.advanceTimersByTime(1000); // Advance timers by 1 second
    controller.abort(); // Abort after advancing timers

    await expect(manager.runAll(controller.signal)).rejects.toThrow();
  });

  test('should reject if at least one process terminates with an error', async () => {
    const processes = [
      new PredictedProcess(1, 'echo "Process 1"'),
      new PredictedProcess(2, 'invalid-command'), // This will cause an error
      new PredictedProcess(3, 'echo "Process 3"'),
    ];
    const manager = new PredictedProcessesManager(processes);

    (spawn as jest.Mock).mockImplementation((command: string) => ({
      on: (event: string, callback: Function) => {
        if (event === 'error' && command === 'invalid-command') {
          callback(new Error('Process error'));
        } else if (event === 'close') {
          callback(0);
        }
      },
      kill: jest.fn(),
      removeAllListeners: jest.fn(),
    }));

    await expect(manager.runAll()).rejects.toThrow();
  });

  test('should run all processes to completion or error without AbortSignal', async () => {
    const processes = [
      new PredictedProcess(1, 'echo "Process 1"'),
      new PredictedProcess(2, 'echo "Process 2"'),
      new PredictedProcess(3, 'echo "Process 3"'),
    ];
    const manager = new PredictedProcessesManager(processes);

    (spawn as jest.Mock).mockImplementation(() => ({
      on: (event: string, callback: Function) => {
        if (event === 'close') callback(0); // Simulate successful exit
      },
      kill: jest.fn(),
      removeAllListeners: jest.fn(),
    }));

    await expect(manager.runAll()).resolves.toBeUndefined();
  });
});
