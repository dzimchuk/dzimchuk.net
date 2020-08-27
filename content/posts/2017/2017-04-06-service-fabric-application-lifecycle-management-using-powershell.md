---
title: Service Fabric application lifecycle management using PowerShell
date: 2017-04-06T15:11:00.000Z
lastmod: 2017-09-06T04:36:44.000Z
permalink: service-fabric-application-lifecycle-management-using-powershell
excerpt: This post is a collection of notes that I took as I was familiarizing myself with lifecycle management of Service Fabric applications. As I was going through the process I learned more about versioning and packaging, deployment and upgrade scenarios.
uuid: 7f8cd9a4-3f4a-4a0a-925d-4f01f2c5dffa
tags: Azure Service Fabric, Azure PowerShell
---

This post is a collection of notes that I took as I was familiarizing myself with lifecycle management of Service Fabric applications. As I was going through the process I learned more about versioning and packaging, deployment and upgrade scenarios. Oh, and by the way I've found the official [documentation](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-application-lifecycle) pretty helpful.

## Connect to cluster

It all starts with establishing a connection to your cluster. We use a client connection endpoint (port 19000) for this. I've protected my cluster with Azure AD and thus I need to specify `-AzureActiveDirectory` flag when calling `Connect-ServiceFabricCluster`:

```
Connect-ServiceFabricCluster -ConnectionEndpoint 'dzimchuk.westeurope.cloudapp.azure.com:19000' -AzureActiveDirectory -ServerCertThumbprint '<thumbprint value>'
```

If you use a client certificate there are appropriate parameters allowing the cmdlet to look it up. `-ServerCertThumbprint` is used to verify if we are connecting to the correct cluster.

## Upload application package to image store

The application package is created during the build process and is basically a directory structure containing an application manifest and service directories, each containing a service manifest and additional folders for code, config and data packages. As of SDK 2.5 release there is a new switch on `Copy-ServiceFabricApplicationPackage` cmdlet called `-CompressPackage` which enables in place compression of service packages and allows you to save bandwidth and time.

```
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath '<path to package>' -ImageStoreConnectionString fabric:ImageStore -ApplicationPackagePathInImageStore BookFast100 -CompressPackage
```

The image store runs as a separate service inside your cluster (except for one box scenario). You have to provide a connection string to it which is by default configured as `fabric:ImageStore`. You should also provide a path in the image store to be used for this particular version of the package. You're going to need to specify this path later when registering an application type. You may want to come up with a convention where the path corresponds to the application package version.

## Register application type

Once your package is in the image store it's time to register it as a separate version application type.

```
Register-ServiceFabricApplicationType -ApplicationPathInImageStore BookFast100
```

`Register-ServiceFabricApplicationType` verifies the package and uploads it to the internal location. Only when the verification succeeds will you be able to create or upgrade applications with the new package.

It may take longer than the default timeout of 60 seconds to register an application type of a large application. You can specify a timeout with `-TimeoutSec` parameter or you may choose to run the command asynchronously with `Async` flag. You can check the status of the asynchronous operation with `Get-ServiceFabricApplicationType` cmdlet.

## Create new application

`New-ServiceFabricApplication` cmdlet creates an application of a registered application type. When an application is created all services defined as default services in the application manifest get created as well. Services can also be individually created as part of the specified running application with `New-ServiceFabricService` cmdlet.

```
$ParametersXml = ([xml] (Get-Content '<path>\Cloud.xml')).Application.Parameters

$parameters = @{}
$ParametersXml.ChildNodes | foreach {
       if ($_.LocalName -eq 'Parameter') {
           $parameters[$_.Name] = $_.Value
       }
    }

New-ServiceFabricApplication -ApplicationName fabric:/BookFast -ApplicationTypeName BookFastType -ApplicationTypeVersion 1.0.0 -ApplicationParameter $parameters
```

Service Fabric supports [per environment configuration](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-manage-multiple-environment-app-configuration) and we can pass a hashtable of environment specific parameters to `New-ServiceFabricApplication` cmdlet. In the example above we construct the hashtable by parsing the cloud environment parameters file which gets added by the default Visual Studio template. The actual parameters must be defined in the application manifest.

#### Alternative scripts

I'd like to make a side note here that Visual Studio relies on a separate collection of PowerShell scripts when working with Service Fabric. These scripts can be found in 'c:\Program Files\Microsoft SDKs\Service Fabric\Tools\PSModule\ServiceFabricSDK\' folder and are supposed to be used with Visual Studio tooling. There are script like `Publish-NewServiceFabricApplication` or `Publish-UpgradedServiceFabricApplication` that accept a per environment configuration file.

Visual Studio even gives you a higher level universal script `Deploy-FabricApplication.ps1` that supports publish profiles which are also added by the default solution template.

These scripts provide a somewhat more convenient API from the tooling perspective. They ultimately rely on the [Service Fabric PowerShell](https://docs.microsoft.com/en-us/powershell/servicefabric/vlatest/servicefabric) module.

## Upgrade application

Before you can upgrade your application you need to upload a new version of the application package to a new location in the image store:

```
Copy-ServiceFabricApplicationPackage -ApplicationPackagePath '<path to package>' -ImageStoreConnectionString fabric:ImageStore -ApplicationPackagePathInImageStore BookFast101 -CompressPackage
```

The new package should have appropriate service manifests and the application manifest versions updated. In other words, if you change any package of any service the affected services' manifests should reflect the new package versions and have their own manifest versions updated.

For example, if I update a configuration package of the Booking service to version 1.0.1. I should also update the service manifest version:

```
<ServiceManifest Name="BookFast.BookingPkg"
                 Version="1.0.1"
                 xmlns="http://schemas.microsoft.com/2011/01/fabric"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ServiceTypes>
    <StatefulServiceType ServiceTypeName="BookingServiceType" HasPersistedState="true" />
  </ServiceTypes>
  
  <CodePackage Name="Code" Version="1.0.0">
    ...
  </CodePackage>
  
  <ConfigPackage Name="Config" Version="1.0.1" />
  
</ServiceManifest>
```

Now because the service manifest has changed I need to import the new version in the application manifest and also update its version:

```
<ApplicationManifest xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ApplicationTypeName="BookFastType" ApplicationTypeVersion="1.0.1" xmlns="http://schemas.microsoft.com/2011/01/fabric">
  
  <ServiceManifestImport>
    <ServiceManifestRef ServiceManifestName="BookFast.BookingPkg" ServiceManifestVersion="1.0.1" />
    ...
  </ServiceManifestImport>
  
</ApplicationManifest>
```

Then you register the new package with `Register-ServiceFabricApplicationType` cmdlet. It verifies the content of every package of every service and compares it to the already registered versions of the same packages. Now, if I rebuilt the whole application package from scratch I'm going to run into the following error:

```
Register-ServiceFabricApplicationType -ApplicationPathInImageStore BookFast101

Register-ServiceFabricApplicationType : The content in CodePackage Name:Code and Version:1.0.0 in Service Manifest 'BookFast.BookingPkg' has changed, but the version number is the same.
```

Even though I haven't touched the code package its binary content has changed. Thus I should either make sure to provide the same built artifacts for the unchanged packages or I can upload a diff package.

A diff application package is the same directory structure as a full package however it only contains modified packages together with appropriate updated service manifests and the update application manifest. Any reference in the application manifest or service manifests that can't be found in the diff package is searched for in the image store.

Note that as of the time of this writing there was an issue when diff packages were used to upgrade applications deployed with compressed full packages:

```
Register-ServiceFabricApplicationType : The Image Builder encountered an unexpected error.
```

Hopefully it will be addressed soon.

Now we have 2 application types registered in the cluster and the currently active application created from version 1.0.0:

![Two registered application types](https://blogcontent.azureedge.net/2017/04/application_types.png)

If we dig down on the details of version 1.0.1 type we're going to see the expected hierarchy of package and manifest versions:

![Hierarchy of package and manifest versions](https://blogcontent.azureedge.net/2017/04/versioning.png)

Now we're ready to start a monitored rolling upgrade of the application.

```
Start-ServiceFabricApplicationUpgrade -ApplicationName fabric:/BookFast -ApplicationTypeVersion 1.0.1 -HealthCheckStableDurationSec 60 -UpgradeDomainTimeoutSec 1200 -UpgradeTimeoutSec 3000 -FailureAction Rollback -Monitored
```

`Start-ServiceFabricApplicationUpgrade` also allows you to provide a new set of environment specific parameters if needed.

The upgrade is performed one upgrade domain at a time. Service Fabric performs health checks before moving to the next upgrade domain. We also chose to roll back to the previous version of the application if the upgrade fails at any point. Most of the upgrade parameters and timeouts are configurable. You can get more details on upgrade parameters [here](https://docs.microsoft.com/en-us/azure/service-fabric/service-fabric-application-upgrade-parameters).

![Rolling upgrade](https://blogcontent.azureedge.net/2017/04/rolling_upgrade.png)

The status of the rolling upgrade can also be monitored with PowerShell:

```
Get-ServiceFabricApplicationUpgrade -ApplicationName fabric:/BookFast


ApplicationName                         : fabric:/BookFast
ApplicationTypeName                     : BookFastType
TargetApplicationTypeVersion            : 1.0.1
ApplicationParameters                   : {}
StartTimestampUtc                       : 4/5/2017 11:08:35 AM
UpgradeState                            : RollingForwardInProgress
UpgradeDuration                         : 00:02:00
CurrentUpgradeDomainDuration            : 00:00:00
NextUpgradeDomain                       : 2
UpgradeDomainsStatus                    : { "1" = "InProgress";
                                          "0" = "Completed";
                                          "2" = "Pending" }
UpgradeKind                             : Rolling
RollingUpgradeMode                      : Monitored
FailureAction                           : Rollback
ForceRestart                            : False
UpgradeReplicaSetCheckTimeout           : 49710.06:28:15
HealthCheckWaitDuration                 : 00:00:00
HealthCheckStableDuration               : 00:01:00
HealthCheckRetryTimeout                 : 00:10:00
UpgradeDomainTimeout                    : 00:20:00
UpgradeTimeout                          : 00:50:00
ConsiderWarningAsError                  :
MaxPercentUnhealthyPartitionsPerService :
MaxPercentUnhealthyReplicasPerPartition :
MaxPercentUnhealthyServices             :
MaxPercentUnhealthyDeployedApplications :
ServiceTypeHealthPolicyMap              :
```

I would also like to mention one upgrade scenario when a new version of your application does not contain a service that used to be part of it in the previous version. In this case the upgrade will fail with the following message:

```
Start-ServiceFabricApplicationUpgrade : Services must be explicitly deleted before removing their Service Types.
```

In order to proceed with the upgrade you need to remove the running service with `Remove-​Service​Fabric​Service` cmdlet first.

## Tear down application

Tearing down a running application is the opposite process. First, you need to stop/remove it:

```
Remove-ServiceFabricApplication -ApplicationName fabric:/BookFast -Force
```

Then you unprovision/unregister its type:

```
Unregister-ServiceFabricApplicationType -ApplicationTypeName BookFastType -ApplicationTypeVersion 1.0.0 -Force
```

And finally, you remove the application package from the image store:

```
Remove-ServiceFabricApplicationPackage -ApplicationPackagePathInImageStore BookFast100 -ImageStoreConnectionString fabric:ImageStore
```