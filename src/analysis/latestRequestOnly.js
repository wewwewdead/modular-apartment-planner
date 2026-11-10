/**
 * A study worker's message handler that solves only the newest request.
 *
 * A solve runs to completion inside one task, so requests posted while it runs
 * queue up behind it — and each used to be solved in full, in turn, although
 * only the newest can still be on screen (`useStudyWorker` drops every reply
 * but the pending one's). So each message only records itself as the latest
 * and defers its solve by one task; queued messages are all delivered before
 * those deferred solves run, and a solve whose request has been overtaken by
 * then is skipped. It gets no reply: nobody is waiting for it.
 *
 * What this cannot do is stop a solve already running — that needs the
 * solvers to yield between chunks.
 */
export function handleLatestRequestOnly(solve) {
  let latestId;
  return (event) => {
    const request = event.data || {};
    latestId = request.id;
    setTimeout(() => {
      if (request.id !== latestId) return;
      solve(request);
    }, 0);
  };
}
