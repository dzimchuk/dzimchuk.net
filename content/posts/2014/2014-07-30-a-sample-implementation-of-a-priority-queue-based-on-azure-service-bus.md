---
title: A sample implementation of a priority queue based on Azure Service Bus
date: 2014-07-30 18:44:00
permalink: a-sample-implementation-of-a-priority-queue-based-on-azure-service-bus
excerpt: Last time I was talking about what a priority queue is and how we can approach designing it. In this post I want to guide you through a sample implementation of such a queue that won’t require dedicated computing resources per each priority.
uuid: 4569c252-184f-4bad-85cb-b5e340d80a11
tags: Cloud Patterns, Azure Service Bus
---

[Last time](post/Implementing-a-priority-queue-on-Microsoft-Azure) I was talking about what a priority queue is and how we can approach designing it. In this post I want to guide you through a sample implementation of such a queue that won’t require dedicated computing resources per each priority. The queue is going to be based on Microsoft Azure Service Bus but the approach can be adapted to other queue offerings.

[![Priority Queue based on multiple queues](https://blogcontent.azureedge.net/PriorityQueue_MultiQueue_thumb_1.png "Priority Queue based on multiple queues")](https://blogcontent.azureedge.net/PriorityQueue_MultiQueue_1.png)

There are a few important notes about the design.

First, the receiver should implement a logic to get a prioritized messaged. It can be a simple iteration over queues from the one with the highest priority to the one with the lowest one. This is the way the receiver works in my sample. On the other hand, we can implement a sophisticated logic that would throttle messages of the same priority giving a chance for other messages to get processed too even if there is a peak of high priority requests. The logic is totally up to you.

Second, the receiver should be smart enough to wait for new messages on completion threads when there are no pending messages currently available in the queues. We don’t want excessive polling and we don’t want extra delays due to sleep intervals.

Then the dispatcher should take the number of processors or (better put) cores available to your machine and block the pump from getting more messages when all worker threads are busy.

> I’m going to show a lot of code in this post but you can just grab the [solution from Bitbucket](https://bitbucket.org/dzimchuk/priorityqueue) and play with it on your own.

Ok, let’s start with the pump:

```
public Task Start(CancellationToken cancellationToken)
{
    return Task.Run(async () =>
    {
        while (true)
        {
            var message = await receiver.GetMessageAsync(cancellationToken);
            await dispatcher.DispatchAsync(message, cancellationToken);
        }
    }, cancellationToken);
}

```

This can be as simple as that. It gets a message from the receiver and then it passes it over to the dispatcher. It may not necessarily need to start on a separate thread depending on the hosting environment as it is ultimately an endless loop but it can be convenient to start the pump and continue with some other tasks. I also propagate cancellation tokens throughout my components so I can shut down as quickly as possible.

All right, let’s have a look at the receiver:

```
public async Task<IMessage> GetMessageAsync(
    CancellationToken cancellationToken)
{
    IMessage message;

    do
    {
        cancellationToken.ThrowIfCancellationRequested();

        message = await TryGetMessageAsync(cancellationToken);

        if (message == null)
            await WaitAsync(cancellationToken);
    } while (message == null);

    return message;
}

```

Another loop that first tries to get the prioritized message and blocks waiting if there are no messages in any queues. As mentioned earlier I implemented a simple algorithm for prioritizing messages:

```
private readonly IEnumerable<MessageQueue> queues;

public MessageReceiver(IEnumerable<MessageQueue> queues)
{
    this.queues = queues.OrderBy(c => c.Priority).ToList();
}

private async Task<IMessage> TryGetMessageAsync(
    CancellationToken cancellationToken)
{
    foreach (var queue in queues)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var message = await queue.ReceiveAsync(TimeSpan.Zero);
        if (message != null)
            return message;
    }

    return null;
}

```

There is a lot of room for tweaking the behavior so it fits the needs of your solution. But let’s keep it simple for the sample. The receiver should also be able to ‘fall asleep’ if there are no pending messages:

```
private readonly ConcurrentDictionary<int, Task> awaiters = 
    new ConcurrentDictionary<int, Task>();

private Task WaitAsync(CancellationToken cancellationToken)
{
    foreach (var queue in queues)
    {
        cancellationToken.ThrowIfCancellationRequested();

        Task awaiter;
        if (awaiters.TryGetValue(queue.Priority, out awaiter))
        {
            if (!IsAwaitCompleted(awaiter))
            {
                continue;
            }
        }

        awaiter = queue.ReceiveAsync(TimeSpan.MaxValue)
            .ContinueWith(async prev =>
            {
                if (prev.Exception != null)
                {
                    Logger.Instance.WriteException(prev.Exception);
                }
                else
                {
                    await prev.Result.AbandonAsync();
                    Logger.Instance
                        .WriteMessage(EventId.AbandonByWaiter, 
                            "Abandoned on wait {0}", 
                                prev.Result.GetData());
                }
        }, cancellationToken);

        awaiters[queue.Priority] = awaiter;
    }

    return Task.WhenAny(awaiters.Values);
}

private static bool IsAwaitCompleted(Task awaiter)
{
    return awaiter.IsCompleted || awaiter.IsCanceled || 
        awaiter.IsFaulted;
}

```

As you can see I’m not playing with timers or sleeps as I want the solution to respond as soon as a message is available. The awaiters should abandon the messages because they are going to be received through the prioritization mechanism. There is some minimal extra overhead in terms of network traffic but it looks like a reasonable trade-off to accomplish our goal.

Let’s dive into the dispatcher now:

```
private readonly AsyncSemaphore semaphore = new AsyncSemaphore(ProcessorCount.Cores);

public async Task DispatchAsync(IMessage message, 
    CancellationToken cancellationToken)
{
    if (message == null)
        throw new ArgumentNullException("message");

    var slot = semaphore.WaitAsync();
    if (slot.IsCompleted)
    {
        var dispatchedMessage = new DispatchedMessage
                                        {
                                            Message = message,
                                            CancellationToken = cancellationToken
                                        };
    	Task.Factory.StartNew(DoDispatchAsync, dispatchedMessage, cancellationToken);
    }
    else
    {
        await message.AbandonAsync();
        await WaitForSlotAndReleaseAsync(slot);
    }
}

```

The dispatcher should allow a worker thread to process a message but if all worker threads are busy it should block the pump from getting new messages. My sample assumes the worker are going to be doing mostly compute bound work so the number of worker is limited to the [number of CPU cores available on the machine](http://stackoverflow.com/questions/1542213/how-to-find-the-number-of-cpu-cores-via-net-c). I use an asynchronous implementation of a Semaphore to throttle the dispatcher.

> If you haven’t yet, you should check out an awesome [blog series](http://blogs.msdn.com/b/pfxteam/archive/2012/02/12/10266983.aspx) by [Stephen Toub](http://social.msdn.microsoft.com/profile/stephen%20toub%20-%20msft/) on implementing thread synchronization primitives in terms of TPL async model. There are samples for manual and auto reset events, semaphore, reader/writer locks and the others. I highly recommend you go through this stuff!

So when a worker thread (a slot) is available we just dispatch. We don’t wait for the task to complete as we want to continue reading and processing new messages if we have capacity. Note that I moved from a traditional usage of a semaphore where I first have to wait for the slot to be available and then continue with my task. I did that because I need to first release the message before I block waiting. If I release the message it can be picked up by another instance of my worker role for example.

Once again, I recommend that you check out the [complete solution](https://bitbucket.org/dzimchuk/priorityqueue) at [Bitbucket](https://bitbucket.org/). It contains integration tests for the receiver and the dispatcher so you can see it in action running against real Service Bus queues.

Let’s have a look at a sample output from the test:

7/30/2014 11:59:17 PM Message pump started.  
7/30/2014 11:59:18 PM #processors: 4  
7/30/2014 11:59:19 PM Wait for 18000ms  
7/30/2014 11:59:19 PM #messages: 10  
7/30/2014 11:59:20 PM Working on [p1 message 2]  
7/30/2014 11:59:20 PM Abandoned on wait  
7/30/2014 11:59:20 PM Abandoned on wait  
7/30/2014 11:59:20 PM Working on [p1 message 3]  
7/30/2014 11:59:20 PM Abandoned on wait  
7/30/2014 11:59:20 PM Working on [p1 message 1]  
7/30/2014 11:59:20 PM Working on [p2 message 1]  
7/30/2014 11:59:20 PM Waiting for worker  
7/30/2014 11:59:24 PM Completed p1 message 2  
7/30/2014 11:59:24 PM Completed p1 message 3  
7/30/2014 11:59:24 PM Working on [p2 message 2]  
7/30/2014 11:59:24 PM Completed p1 message 1  
7/30/2014 11:59:24 PM Working on [p2 message 3]  
7/30/2014 11:59:24 PM Completed p2 message 1  
7/30/2014 11:59:25 PM Working on [p3 message 2]  
7/30/2014 11:59:25 PM Working on [p3 message 3]  
7/30/2014 11:59:25 PM Waiting for worker  
7/30/2014 11:59:28 PM Completed p2 message 2  
7/30/2014 11:59:28 PM Completed p2 message 3  
7/30/2014 11:59:29 PM Working on [p3 message 4]  
7/30/2014 11:59:29 PM Completed p3 message 2  
7/30/2014 11:59:29 PM Working on [p3 message 1]  
7/30/2014 11:59:29 PM Completed p3 message 3  
7/30/2014 11:59:33 PM Completed p3 message 4  
7/30/2014 11:59:33 PM Completed p3 message 1  
7/30/2014 11:59:38 PM Message pump stopped.

We are dealing with a 4 core CPU and we sent 10 messages at once: 4 to the lowest priority queue (3), 3 to the middle priority queue (2) and again 3 to the high priority queue. You see 3 ‘Abandoned on wait’ messages because the receiver was waiting on all of the three queues before we started sending messages. Then we can see the first 4 messages got dispatched and then the dispatcher throttled the process by waiting for an available worker. The worker became available in approximately 4 seconds (which is a message processing time I set in my tests) and the pump continued to get more messages. Note that the messages got dispatched according to their priority.