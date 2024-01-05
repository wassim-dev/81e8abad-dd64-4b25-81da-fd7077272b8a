import { spawn, type ChildProcess } from 'child_process';

type QueueItem = {
  resolve: Function,
  reject: Function,
  signal: AbortSignal
};

export class PredictedProcess {
  private _childProcess: ChildProcess | null = null;
  private _memoize: boolean = false;
  private queue: QueueItem[] = [];
  private successfulList: AbortSignal[] = [];

  public constructor(
    public readonly id: number,
    public readonly command: string,
  ) {}

  /**
   * Spawns and manages a child process to execute a given command, with handling for an optional AbortSignal.
   *
   * WRITE UP:
   * (Please provide a detailed explanation of your approach, specifically the reasoning behind your design decisions. This can be done _after_ the 1h30m time limit.)
   *
   * The solution is as follows:
   * - If memoization is not enabled or no signal is provided,
   *   we execute the command using the exec function.
   * - If memoization is enabled and a signal is provided,
   *   we return a promise. We save the resolve and reject callbacks
   *   with the provided signal into a queue, then run the queue one by one.
   *   On each iteration:
   *   - We remove the current item from the queue list.
   *   - In case of success, we iterate over all queue items and resolve
   *     any item with the same signal.
   *   - We add the signal to a successful list.
   */
  public async run(signal?: AbortSignal): Promise<void> {
    // Immediately reject if the signal is already aborted
    if (signal && signal.aborted) {
      return Promise.reject(new Error('Signal already aborted'));
    }

    // Immediately resolve if already succeeded with the provided signal and memoization is enabled
    if (signal && this._memoize && this.successfulList.includes(signal)) {
      return Promise.resolve();
    }

    if (this._memoize && signal) {
      // If there is a signal and memoization is enabled, create a new item in the queue and add it to the queue list
      let reject: Function = () => null;
      let resolve: Function = () => null;
      const result = new Promise<void>((_resolve, _reject) => {
        resolve = () => _resolve();
        reject = (err?: Error) => _reject(err);
      })
      this.queue.push({ reject, resolve, signal });

      // Run the next item in the queue
      this.runNext();
      return result;
    } else {
      // If there is no signal or memoization is not enabled, execute the command
      return this.exec(signal);
    }
  }

  /**
  * runNext function: Executes the next item in the queue.
  */
  private runNext = () => {
    // Check if there is an ongoing execution; exit if true.
    if (this._childProcess) return;

    // Retrieve the oldest item from the queue
    const item: QueueItem | undefined = this.queue.shift();

    // Execute the oldest item if memoization is enabled
    if (item && this._memoize) {
      this.exec(item.signal)
        .then(() => {
          // Push the signal to the successfulList
          this.successfulList.push(item.signal);

          // Resolve the current item and then resolve all items with the same signal
          item.resolve();
          this.queue = this.queue
            .filter(elm => {
              if (elm.signal === item.signal) {
                elm.resolve();
                return false;
              }
              return true;
            });
        })
        .catch((error) => item.reject(error))
        .finally(this.runNext);
    }
  }

  /**
   * exec function: Executes the command, taking into account the provided signal.
   */
  private exec = (signal?: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      // Create the child process
      const childProcess = spawn(this.command, []);
      this._childProcess = childProcess;

      // The onAbort function will be called when the signal.abort event is emitted
      const onAbort = () => {
        cleanup();
        reject(new Error('Process aborted by signal.'));
      }

      // The cleanup function will be called at the end of any execution
      const cleanup = () => {
        childProcess.removeAllListeners();
        childProcess.kill();
        this._childProcess = null;
        if (signal) signal.removeEventListener('abort', onAbort);
      }

      // Add a listener for abort in case the signal is defined
      if (signal) signal.addEventListener('abort', onAbort);

      // Add a listener for childProcess error
      childProcess.on('error', () => {
        cleanup();
        reject(new Error(`Process exited with error`));
      });

      // Add a listener for childProcess close
      childProcess.on('close', (code) => {
        cleanup();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Returns a memoized version of `PredictedProcess`.
   *
   * WRITE UP:
   * (Please provide a detailed explanation of your approach, specifically the reasoning behind your design decisions. This can be done _after_ the 1h30m time limit.)
   *
   * - We add a boolean variable to indicate that memoization is enabled.
   *
   */
  public memoize(): PredictedProcess {
    // Enable memoization
    this._memoize = true;
    return this;
  }
}
