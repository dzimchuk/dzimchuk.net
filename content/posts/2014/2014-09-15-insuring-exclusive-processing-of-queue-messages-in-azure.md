---
title: Insuring exclusive processing of queue messages in Azure
date: 2014-09-15T17:57:00.000Z
lastmod: 2017-11-01T20:42:28.000Z
permalink: insuring-exclusive-processing-of-queue-messages-in-azure
excerpt: It is pretty common that you have multiple instances of your worker process grabbing messages off the queues in a competing manner. What you often want to achieve is that every single message is processed exclusively by a single instance. That single instance may successfully complete...
uuid: 4adc0b8e-1fec-431a-8828-ae1e224f3c7c
tags: Azure Service Bus, Azure Storage, Cloud Patterns
---

Queues are great for implementing asynchronous communication between systems and their components. Microsoft Azure provides two options: Service Bus queue and Storage Queue. They are both great for building up distributed systems although they have certain peculiarities. You can read about more details [in this comparison article](http://msdn.microsoft.com/en-us/library/hh767287(VS.103).aspx).

It is pretty common that you have multiple instances of your worker process grabbing messages off the queues in a competing manner. What you often want to achieve is that every single message is processed exclusively by a single instance. That single instance may successfully complete the processing or it may fail. In the latter case you want the message to become available for this instance or other instance to repeat the processing. You don’t want the problematic message (often called ‘poison’ message) to re-trigger over and over again though.

Both queue types allow you to temporarily acquire a lock on a message. What we want is a flexible control over the period the message is locked:

```
var message = await ... // get message routine

using(var messageLock = new MessageLock(message))
{
    ... // do processing here

    await messageLock.CompleteAsync();
}

```

## Service Bus queue

When using a Service Bus queue you can specify `ReceiveMode.PeekLock` (which is default) when instantiating an instance of the `QueueClient` class. The other option is `ReceiveAndDelete` mode which will guarantee that a message is processed at most once regardless of success or failure whereas the scenario I am covering in this post can be described as ‘successfully process a message at most once’. The time the message is going to be kept hidden while it is being processed by one of the worker instances is defined by the `LockDuraton` property of the queue. While the lock is still held you can call `RenewLock` method to prolong the lock duration for another period defined by the `LockDuration` property.

Let’s have a look at a sample implementation of the `MessageLock` class:

```
public class MessageLock : IDisposable
{
    private BrokeredMessage message;
    private Timer timer;

    private readonly AsyncLock asyncLock = new AsyncLock();

    public MessageLock(BrokeredMessage message)
    {
        this.message = message;
        InitializeTimer();
    }

    public async Task CompleteAsync()
    {
        using (await asyncLock.LockAsync())
        {
            timer.Dispose();

            if (message == null)
                return;

            try
            {
                await message.CompleteAsync();
            }
            catch /*(Exception e)*/
            {
                // log it
            }

            message = null;
        }
    }

    public async Task AbandonAsync()
    {
        using (await asyncLock.LockAsync())
        {
            timer.Dispose();

            if (message == null)
                return;

            try
            {
                await message.AbandonAsync();
            }
            catch /*(Exception e)*/
            {
                // log it
            }

            message = null;
        }
    }

    private void InitializeTimer()
    {
        var renewInterval = 
            new TimeSpan((long)Math.Round(
                message.LockedUntilUtc.Subtract(DateTime.UtcNow)
                    .Ticks * 0.7, 0, MidpointRounding.AwayFromZero));

        timer = new Timer(async state =>
        {
            using (await asyncLock.LockAsync())
            {
                if (message == null)
                    return;

                try
                {
                    await message.RenewLockAsync();
                    timer.Change(renewInterval, 
                        TimeSpan.FromMilliseconds(-1));
                }
                catch /*(Exception e)*/
                {
                    // log it
                }
            }
        }, null, renewInterval, TimeSpan.FromMilliseconds(-1));
    }

    public void Dispose()
    {
        AbandonAsync().Wait();
    }
}

```

So basically we set up a timer that will renew the message when ~70% of its lock time is passed. This interval is of course subject to be adjusted based on your lock duration. I try to use asynchronous calls over the wire as much as possible and I’m using the asynchronous implementation of the exclusive lock by [Stephen Toub](http://blogs.msdn.com/b/pfxteam/archive/2012/02/12/10266988.aspx).

## Azure storage queue

When you post a message to an Azure storage queue you can specify initial visibility delay otherwise the default one will be used which is 30 seconds. It is called initial because you can set a different one while processing a message (in contrast to `RenewLock`) by calling `UpdateMessage` with `MessageUpdateFields.Visibility` parameter.

We can adapt the `MessageLock` class to be used with the storage queue. The timer routine will look something like this:

```
private void InitializeTimer()
{
    var renewInterval = 
        new TimeSpan((long)Math.Round(
            message.NextVisibleTime.Value.Subtract(message.InsertionTime.Value)
            .Ticks * 0.7, 0, MidpointRounding.AwayFromZero));

    timer = new Timer(async state =>
    {
        using (await asyncLock.LockAsync())
        {
            if (message == null)
                return;

            try
            {
                await queue.UpdateMessageAsync(
                    message, visibilityInterval, MessageUpdateFields.Visibility);
                timer.Change(renewInterval, TimeSpan.FromMilliseconds(-1));
            }
            catch /*(Exception e)*/
            {
                // log it
            }
        }
    }, null, renewInterval, TimeSpan.FromMilliseconds(-1));
}

```

We will need a reference to a `CloudQueue` instance. Instead of using `CompleteAsync` we will have to delete the message from the queue. `AbandonAsync` can be replaced with `UpdateMessageAsync`. Although the APIs are different the semantics are pretty much the same.