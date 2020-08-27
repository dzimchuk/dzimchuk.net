---
title: A better implementation of a priority queue
date: 2014-09-29T16:34:00.000Z
lastmod: 2017-09-05T18:57:15.000Z
permalink: a-better-implementation-of-a-priority-queue
excerpt: In my previous post I provided a sample implementation of the Priority Queue pattern that was multiplexing messages from several queues through a dispatcher to a limited number of worker threads. While the basic idea looks good there were a couple of issues...
uuid: 3ba95ea5-116d-49fc-9aa0-505f32e69043
tags: Cloud Patterns, Azure Service Bus
---

In my [previous post](post/A-sample-implementation-of-a-priority-queue-based-on-Azure-Service-Bus) I provided a sample implementation of the [Priority Queue pattern](http://msdn.microsoft.com/en-us/library/dn589794.aspx) that was multiplexing messages from several queues through a dispatcher to a limited number of worker threads. While the basic idea looks good there were a couple of issues that popped up while running a similar solution in the real environment:

*   Some messages got put in the dead letter queue after having reached the maximum delivery count. They were never processed!
*   The application was generating excessive traffic communicating with the queue.

These issues have the same root cause – an attempt to implement strict prioritization by the multiplexer. When all existing messages had been processed the solution blocked waiting on every queue for the first message to come. When a message arrived it was abandoned immediately and all of the queues were questioned again in a loop, this time without blocking, from the one with the highest priority to the one with the lowest. It guaranteed that even if a higher priority message had arrived after those with lower priority it would have been dispatched first. When two or more instances of the service were running they were racing against each other jumping from the block/waiting to the prioritization routine effectively making messages reach their maximum delivery count and be put on the dead letter queue. This unfortunate ping pong situation could be mitigated by not abandoning messages in the block routine and re-using them in the prioritization routine. However, a much more straight forward solution can be proposed.

In the new solution we will allocate a number of worker threads. Each of these threads will be getting messages off of the assigned queue and processing them. When the thread is finished processing a message it will try to get another one from the queue blocking if none is available. Prioritization is achieved by assigning different number of worker threads to the queues of different priority. For example, a top priority queue will be served by 4 threads and the one with the lowest priority will be processed by a single thread. Yes, we lose straight prioritization but in most cases it is not really needed. In fact, we are closer to the [original description](http://msdn.microsoft.com/en-us/library/dn589794.aspx) of the pattern where it is proposed to assign more ‘horse power’ to higher priority queues by marshaling them to worker roles running on VMs with higher spec. In our case we will assign more threads on the same box to process messages with higher priority.

[![A better priority queue design](https://blogcontent.azureedge.net/better_priority_queue_thumb.png "A better priority queue design")](https://blogcontent.azureedge.net/better_priority_queue.png)

Of course, the kind of CPU being used on the machine and the nature of tasks (CPU-bound or IO-bound) will play a huge difference in scalability of the proposed solution. If your tasks are mostly IO-bound and you [properly implement asynchrony](post/Doing-async-the-right-way) you can go with fewer cores than if your tasks were CPU-bound.

So let’s have a look at the queue handler routine:

```
public Task RunAsync(CancellationToken cancellationToken)
{
    return Task.Run(async () =>
           {
               while (true)
               {
                   cancellationToken.ThrowIfCancellationRequested();
                   await ProcessNextMessage();
               }
           }, cancellationToken);
}

private async Task ProcessNextMessage()
{
    try
    {
        using (var message = await receiver.ReceiveAsync())
        {
            var result = await processor.ProcessMessage(message);
            // based on the result decide whether to
            // Complete or Abandon the message
        }
    }
    catch (Exception e)
    {
        // lot unexpected error that might have been thrown
        // when processing a message
    }
}

```

So this is basically an endless loop that processes each message it receives off of the queue in a competing way. It is a good idea to pass a `CancellationToken` to the routine to be able to stop the worker. It can be handy when unit testing and at the role shut down. You might also want to propagate the token to the receiver and the processor to be able to cancel the current cycle as soon as possible.

The receiver can be as simple as this:

```
public async Task<IMessage> ReceiveAsync()
{
    var brokeredMessage = 
        await queue.ReceiveAsync(TimeSpan.MaxValue);
    return new MessageLock(brokeredMessage);
}

```

Note that we are using a message wrapper described [here](post/Insuring-exclusive-processing-of-queue-messages-in-Azure) so that the message is kept locked while the worker is processing it. Every queue handler gets its own receiver that is configured to get messages from a particular queue and its own processor. I recommend making the number of handlers per queue configurable so you can easily adjust when scaling your roles.