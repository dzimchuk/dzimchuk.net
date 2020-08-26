---
title: Splitting a monolith into microservices
date: 2016-12-08 18:49:33
permalink: splitting-a-monolith-into-microservices
excerpt: It's all about change. Business wants to try out things and back off on unsuccessful attempts as soon as possible to minimize loss. Customers expect software to constantly evolve and better solve their problems. And developers want to be able to incrementally make changes to the system...
uuid: 6f36d588-a420-49c7-9ccd-99645f3422a5
tags: Design and Architecture
---

It's all about change. Business wants to try out things and back off on unsuccessful attempts as soon as possible to minimize loss. Customers expect software to constantly evolve and better solve their problems. And developers want to be able to incrementally make changes to the system and have those changes rolled out to production fast.

## Monolith

Traditionally, we've been splitting our solutions into horizontal layers to separate technical concerns and make solutions maintainable. However, our models, application services, data storage adapters and other components belonging to separate functional areas have been stacked together at appropriate layers. Often data was stored in some common storage such as SQL database and it so tempting easy for one service to reach out and join data belonging to another service introducing additional coupling.

![Monolithic architecture diagram](https://blogcontent.azureedge.net/2016/12/Monolith_Architecture.png)

As time goes by, the system may become infected with unhealthy interdependencies when service boundaries are blurred. It's common for one service to start using a data source interface of another or for code related to a certain logic or function to be spread over multiple places. It becomes increasingly harder to make changes to such systems without affecting many seemingly unrelated components and it all adds up to the stabilization cost.

When it comes to reacting to a change fast, monolithic architecture doesn't quite cut it because it often implies that the system is deployed as a whole and before it happens it requires time consuming validation in the form of multiple QA and/or UAT cycles. And when the deployment happens it often implies some downtime.

Many organizations turn to [microservices](https://en.wikipedia.org/wiki/Microservices) architecture to help overcome these issues. This approach can be adopted both in greenfield and already established projects that have recognized the problems of their solutions and are not afraid to make painful changes both technically as well as organizationally.

## Microservices

Microservices can be thought of as relatively small highly cohesive services that are responsible for particular business (or sometimes cross cutting) capabilities.

They work in today's fast paced world because they can be independently developed, evolved and deployed. Because of their manageable size and autonomy the feedback cycle is short and deploying to prod daily becomes a norm. There autonomy enables you to use different technology stacks, establish independent release cycles and achieve greater scalability and robustness of your solution. If done right.

Being built around a business capability is the key characteristic to keep in mind when it comes to reconsidering your existing monolithic solution and trying to identify those service boundaries (often referred to as bounded context) for your future microservices.

![Microservices architecture diagram](https://blogcontent.azureedge.net/2016/12/Microservices_Architecture.png)

Each service contains all the necessary components to fulfill its purpose. These components can be public and internal API endpoints, background processes, automation scripts, etc. Besides business capability services your solution can also include infrastructure oriented or cross cutting concerns services such as discovery and health monitoring services, telemetry collecting services, etc.

Microservices have well defined API layer that opens them up for the outside world, other services within the solution and enable administrative actions upon them. If we look back at the monolith's presentation layer in the form of a holistic API you're going to find that it can be efficiently torn apart between microservices. However, if it's UI such as a web application it normally cannot be split easily. Teams that own services may produce SDKs targeting various platforms and languages which can facilitate integration with new clients.

As your system consists of a bunch of interconnected microservices and it's important to pay special attention on how they communicate with each other. It's very tempting to resort to what's known as 'database' integration when services not only share data stores but are also made aware of the data persistence nuances of each other. This is something to look out for and prevent at the earliest because such form of integration makes your services coupled and effectively eliminates the core characteristic of a microservice: autonomy.

Microservices are also resilient and can gracefully recover from failures such as temporary unavailability of downstream services. Patterns such as [Retry](https://msdn.microsoft.com/en-us/library/dn589788.aspx) and [Circuit Breaker](https://msdn.microsoft.com/en-us/library/dn589784.aspx) should be implemented at the communication (data) layers of your services.

Another thing to watch out for is shared code which makes it so easy to couple your services. Limit it to infrastructural code or cross cutting concerns if you haven't decided to move them to services on their own. Do not share business logic as the necessity to do so indicates that you probably haven't identified correct service boundaries in the first place.

Microservices can be as simple as a single routine (and it's getting quite common with recent serverless trends) but they can get quite complicated. For example, internally a microservice can have a well defined layered architecture.

![Microservice zoomed-in](https://blogcontent.azureedge.net/2016/12/Microservice_ZoomIn.png)

It's different from the monolith in that the model, logic, persistence and representation are bound to a particular context.

When your solution consists of multiple microservices you have so many moving parts that it becomes extremely important to automate everything in order to implement efficient DevOps cycles.

Talking about DevOps, this is a culture that implies teams made up of cross functional skillsets. Each team should own a microservice (or a few) and should be able to cover all tasks from designing, implementing, testing, deploying to monitoring and analyzing these services. And to build such teams it often requires reorganization which is another painful issue that can meet a lot of resistance. But it's essential that a service is owned by a single team. This is the only way for it to achieve true autonomy technically and procedurally.