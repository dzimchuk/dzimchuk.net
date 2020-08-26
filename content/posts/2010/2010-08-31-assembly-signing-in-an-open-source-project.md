---
title: Assembly signing in an open source project
date: 2010-08-31 08:36:00
permalink: assembly-signing-in-an-open-source-project
uuid: 94f5a15f-d501-452c-9fb5-af026546934a
tags: Practices
---

**[UPDATE, 01/29/2013]**

_As of PVP release 2.0 each assembly has been configured to be signed with a fake key (located at KeyPairs directory). With this approach you don't have to do anything extra (delayed signing, disabling the verification as described in this post). When I build the release I substitute the key with the real one. The approach described in this post is still quite valid but implies additional hassle you might want to avoid._

Before [PVP](http://pvp.codeplex.com/) went open source each subproject contained its version of public/private key pair named <project name>.snk (i.e. pvp.snk, core.snk, etc) and each VS project was configured to sign the output assembly upon building.

When I hosted it on CodePlex I had to remove private keys but I still didn’t want to remove signing altogether. I was looking for a compromise.

I included a public key in each project and configured VS build to delay-sign assemblies with them. Private keys are not stored on CodePlex, instead I keep them on my machine and they are copied to the solution directory under ‘keypairs’ subdirectory.

I also added post-build actions to each project that would re-sign the assemblies with the private keys (line-breaks are added for better readability):

```
call "$(DevEnvDir)..\..\VC\vcvarsall.bat" x86
sn /R "$(TargetPath)" "$(SolutionDir)keypairs\$(TargetName).snk"
sn /R "$(ProjectDir)obj\$(ConfigurationName)\$(TargetFileName)" 
    "$(SolutionDir)keypairs\$(TargetName).snk"

sn /R "$(TargetDir)ru-RU\$(TargetName).resources.dll" 
    "$(SolutionDir)keypairs\$(TargetName).snk"
sn /R "$(ProjectDir)obj\$(ConfigurationName)\ru-RU\
    $(TargetName).resources.dll" 
    "$(SolutionDir)keypairs\$(TargetName).snk"
```

Note that you need to sign assemblies in both output directory as well as in ‘obj’ directory (that’s where they are picked up by the installer) and you also need to sign satellite assemblies if there are any.

Essentially these builds produced fully signed assemblies as though I configured VS projects to sign them with keys found in `$(SolutionDir)keypairs`. What I have achieved was that the signing process became 2 phase: first reserve the space (delay sign) and then actually sign.

Unfortunately, it didn’t make the problem go away completely. When you download the code from CodePlex it won’t build the assemblies with the current configuration as you don’t have the private keys. What can you do? Let's consider typical situations.

## Regular development

You may want to completely remove assembly signing. After all, these are just your local builds, why bother?

However, suppose you updated a component and want to test it against the official build. In this case you can build the component delayed signed using the provided public.snk. Just make sure you disable the CLR checks with (sn -Vr), you can use disable_verification.bat provided in the solution (perhaps some customization will be needed).

When you're done, re-enable the CLR verification (sn -Vu) and submit your code changes for official build.

In all cases you will have to edit projects’ configuration to either remove the custom post-build actions only or remove the post-build actions together with delay signing. You can’t submit your changed project configuration files to the trunk but you can check them in to your own development branch.

## Development with strongly typed assemblies

You may want to use your own public and private keypairs. You are free to set up the projects the way like. The good thing is you don’t even have to change the projects’ configuration. Instead, you can replace public.snk with your own public keys and put your own private keys under `$(SolutionDir)keypairs`.

Of course, make sure not to check in your keys.

Builds produced this way will be your builds, not the official builds. But still that’s an option if you choose to re-use some PVP component in another project.

## Conclusion

There seems to be no easy way to go around this problem. A lot of projects simply don’t sign. I am reluctant to remove signing as it removes identity from your application.

Removing signing from the source control only and keep signing the releases could be an option. However, in this case you won’t be able to test modified assemblies with released ones (which is possible with delayed signing and verification skipping).