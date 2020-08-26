---
title: Implementing a priority queue on Microsoft Azure
date: 2014-07-28 16:36:00
permalink: implementing-a-priority-queue-on-microsoft-azure
excerpt: Queues allow you to decouple components so that they process data or perform tasks in asynchronous manner. This greatly improves scalability and responsiveness of your application. Priority queues allow publishers influence the sequence in which requests are processed.
uuid: dbb3e6a3-605e-430b-ab97-efd47a92ee5f
tags: Cloud Patterns
---

Queues allow you to decouple components so that they process data or perform tasks in asynchronous manner. This greatly improves scalability and responsiveness of your application. Priority queues allow publishers influence the sequence in which requests are processed. It allows them to shift from a regular FIFO pattern to the one that takes a request priority into account and lets the requests with higher priority be processed prior to the requests that may have been scheduled earlier.

In order to implement that you need to have a way to prioritize requests. Unfortunately, queues offered by Microsoft Azure (the storage queue and the Service Bus queue) lack the ability to specify the priority on the messages posted to them so that these messages appear closer to the head of the queue. [Patterns & Practices](http://msdn.microsoft.com/en-us/library/dn589794.aspx) team describes this pattern and they offer to either use a separate queue per priority or use a topic and create subscriptions with a filter by priority. However, whatever the approach you choose a message is expected to be processed by a dedicated worker role. In order to implement prioritizing it is offered to use bigger roles for messages with higher priority. It makes perfect sense because allocating more CPUs, memory and even VMs to messages with high priority will help increase the number of these messages being processed in a set unit of time. At the time, messages with lower priorities don’t get throttled and keep being processed by the roles that have humbler spec and instance quantity.

> But we need to think about the cost of operation!

This is what your customer says when you propose to add a new role to your cloud solution and they are right. Unless you really made it big and your solution receives enormous amount of load you should take advantage of excessive computing resources available in your existing roles. They call it [Compute Resource Consolidation pattern](http://msdn.microsoft.com/en-us/library/dn589778.aspx) and this is really what you need to explore before offering your customers to spend more money.

So what can we do with existing Azure offering to implement a priority queue?

One thing that springs to mind is to replace a queue with another storage option that would allow us to set priorities on messages. For example, what if we take the messages from the queue (Service Bus or Storage) and put them in Table Storage? We can assign the priority value to PartitionKey and use timestamps in the form of [ticks](http://msdn.microsoft.com/en-us/library/system.datetimeoffset.utcticks(v=vs.110).aspx) for row keys. This way our messages are going to be sorted by priority and the time they were scheduled so we can implement an algorithm to get the messages we want first.

[![Priority Queue design based on alternative storage](https://blogcontent.azureedge.net/PriorityQueue_TS_thumb.png "Priority Queue design based on alternative storage")](https://blogcontent.azureedge.net/PriorityQueue_TS.png)

However, as we move away from the native queue implementation we are now faced with technical challenges of implementing message locking, multiple deliveries in case of failures, dead lettering and so on. While it is doable you have to keep in mind that you are probably going poll the storage excessively generating unwanted traffic and cost.

A better approach is to assign a separate queue to a priority (similar to what [Patterns & Practices](http://msdn.microsoft.com/en-us/library/dn589794.aspx) team recommends) given that the number of the priorities is limited and generally small. But instead of dispatching messages of different priorities to dedicated roles we can implement a mechanism to dispatch them to worker threads running within a role instance.

[![Priority Queue designed based on multiple queues](https://blogcontent.azureedge.net/PriorityQueue_MultiQueue_thumb.png "Priority Queue designed based on multiple queues")](https://blogcontent.azureedge.net/PriorityQueue_MultiQueue.png)

There are two important things to notice here. First, the message receiver should be able to quickly scan though all available queues for a message with the highest priority. It should also be able to block waiting for a message when there are no pending messages in any of the queues. Second, the dispatcher should keep track of the worker threads and have means to notify the engine to postpone getting new messages when all worker threads are busy. Normally, it won’t make sense to schedule more CPU bound tasks than you have CPUs available in your role instance. Of course, you can schedule more IO bound tasks if they are properly implemented. So this is something that should be adjustable and configurable,

In the upcoming post I’m going to dive deeper into implementing the latter approach.