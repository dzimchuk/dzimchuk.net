---
title: Have you set up a package versioning strategy?
date: 2014-09-18 15:34:00
permalink: have-you-set-up-a-package-versioning-strategy
uuid: 9ef39173-db96-4714-9ce9-ab576bcfdbbb
tags: Practices
---

When developing real world software we inevitably have to deal with shared components. These components can be reused across different teams or even within a single team that is moving towards [microservices](http://martinfowler.com/articles/microservices.html) architecture. How do we share components?

You probably heard of [Maven](http://maven.apache.org/) and [NPM](https://www.npmjs.org/) but if you’re coming from the .NET part of the planet your answer is [NuGet](http://www.nuget.org/). We can create NuGet packages for each of our components, host them on a local server that can be accessed by all of our team members and other teams if needed. We can even go with tailored hosting solutions like [ProGet](http://inedo.com/proget/overview) or [MyGet](http://www.myget.org/).

There are two important things that we need to decide upon before we move further: branching model and package versioning strategy.

With branching we usually follow the proven path of having a main integration branch where all current and future development is done. We normally split feature branches off of the main one and then merge complete features into the main. We also split release branches off of the main when we decide that the scope for the current release is done. We use release branches to isolate future development from the release versions and to deliver hot fixes to released versions of our software.

It is important to follow this model across all of your components. It is not enough to use release branches in repositories that contain resulting software (applications). Our reusable components require the same technique to effectively marshal development flows.

Now that the source code is organized we come to a point of organizing the built artifacts of our reusable components that are made available as NuGet packages. The packages are versioned but the problem is that the versions are sequential and there are no branches.

If versions are not properly managed we will run into situations when we can't control if a newer version of our dependency will break our application or not. Remember, we have several release branches and the main development branch and changes to shared components can come from each of them and new versions of the shared components are created and uploaded to the hosting server.

There has to be a discipline, a strategy to keep things organized. And there is one - [Semantic Versioning](http://semver.org/).

I highly recommend you go through the spec yourself but here's the gist of it. The version number contains 3 digits: Major.Minor.Patch.

Major version change should represent a breaking change when an externally consumable interface or contract has changed. Consumers should be conscious that if they update their dependency to a new one with a higher major version they are very likely to adjust their software so it can work with the new dependency.

Minor version represents new functionality without breaking existing one. It can also represent internal refactoring or optimization. The important thing is externally visible interface stays intact and contracts are not broken.

Patch version should be increased when we deliver a bug fix. Sometimes there is the 4rth digit that represents a build number. It is normally managed by the build system and should not be incremented manually.

Let’s have a look at an example:

V1.0.2 -> component deployed with release 1.0  
V1.0.3 -> a hot fix for the component deployed with release 1.0

V2.1.0 -> component deployed with release 2.0  
V2.1.1 -> hotfix for the component deployed with release 2.0

V3.4.2 -> current development  
V3.5.0 -> someone added new functionality  
V3.5.1 -> someone fixed a bug  
V4.0.0 -> someone changed the public interface

Sometimes suffixes like ‘prerelease’ or ‘alpha’ etc. are used as part of the version to indicate either instable or experimental nature of a particular version of the package, or a specific cycle in the software release. These versions have lower precedence than stable versions, for example:

v2.1.0 –> V2.2.0-prerelease –> V2.2.0

Now that we have established the versioning scheme let’s consider the following problem. Let’s say the current release uses version 2.0.0 of a shared component and in the main branch quite a few breaking changes have been introduced and the component is at version 5.0.0\. A bug was found in the deployed system and it happens to come from that very shared component. We provide a fix as a new version (2.0.1) of the component to be deployed in production. We also discovered that our main branch also suffers from the same problem and we want to forward port the fix to the main branch.

Apparently the main branch will contain a new version of the component that will be set to 5.0.1\. But how do we achieve that?

One option is to have a dedicated person to perform a merge from the release branch into the main. However. this person will have to manually adjust the version of the package. Now imagine we have multiple affected components that have interdependencies. Now this guy should go and fix the interdependencies as well. Quite a demotivating job I have to tell you!

A much more feasible option will be to offload this work to developers who deliver the fix. The developers should know which versions of the software are expected to receive the fix and they open separate pull request per each version with proper package versions.

Yes, this requires a discipline and additional attention at code reviews and QA acceptance. Your tracking system should have means to indicate in work items the expected versions of the software that the delivery should be made to. If it only allows to specify a single version than you have to have a formal procedure in place that requires corresponding work items to be created for each version.

So how do you version your packages?