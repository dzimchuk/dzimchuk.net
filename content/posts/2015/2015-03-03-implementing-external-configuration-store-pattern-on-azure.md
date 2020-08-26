---
title: Implementing External Configuration Store Pattern on Azure
date: 2015-03-03 16:39:00
permalink: implementing-external-configuration-store-pattern-on-azure
excerpt: Configuration management is an important part of running and evolving public facing services when down time is not tolerated and you need maximum flexibility in adjusting settings of running services. Implementing External Configuration Store Pattern opens up some great possibilities for you like...
uuid: 244f734f-be81-45d1-aedc-ebfda40bf0e6
tags: Cloud Patterns, Azure Cloud Services
---

Configuration management is an important part of running and evolving public facing services when down time is not tolerated and you need maximum flexibility in adjusting settings of running services. Implementing [External Configuration Store Pattern](https://msdn.microsoft.com/en-us/library/dn589803.aspx) opens up some great possibilities for you like independent deployment of your services and configuration, sharing configuration between multiple services and versioning of configuration sets. By versioning your configuration sets you define which services use which set of configuration settings at any given time. You can roll back and forth configuration sets per service as needed.

I am going to demonstrate this pattern on a sample Azure cloud service. I’m going to build upon a test solution that I used in my [previous post](post/Be-aware-of-Web-role-host-process). You can find it on [Bitbucket](https://bitbucket.org/dzimchuk/azuresettingsupdatesample/src) so you can clone and run it on your own.

## Organizing settings

Let’s start with moving our configuration settings to external files. In my sample I’m going to use XML files but of course you’re not limited to file formats or schema. You may even choose to store your configuration in a database of some sort.

[![External configuration files](https://blogcontent.azureedge.net/image_thumb_5.png "External configuration files")](https://blogcontent.azureedge.net/image_5.png)

Note that we have separate configuration files per deployment type. It’s just an example, you may come up with an organization that better suites your needs. To give you an idea of what an external configuration file may look like:

```
<?xml version="1.0" encoding="utf-8"?>
<ConfigurationSettings>
  <Setting name="Diagnostics.ConnectionString" value="UseDevelopmentStorage=true" />
  <Setting name="TestSetting" value="initial" />
  <Setting name="Microsoft.ServiceBus.ConnectionString" value="" />
</ConfigurationSettings>

```

It does resemble standard .cscfg files of an Azure cloud service but it’s just because I decided to keep them this way. Talking about .cscfg files they are not gone. Instead of storing our application specific settings they are going to store some metadata that’s necessary to find appropriate external configuration:

```
<?xml version="1.0" encoding="utf-8"?>
<ServiceConfiguration serviceName="AzureSettingsUpdateSample" 
    xmlns="http://schemas.microsoft.com/ServiceHosting/2008/10/ServiceConfiguration" 
    osFamily="4" osVersion="*" schemaVersion="2014-06.2.4">
  <Role name="TestWebRole">
    <Instances count="1" />
    <ConfigurationSettings>
      <Setting name="Diagnostics.ConnectionString" value="UseDevelopmentStorage=true" />
      <Setting name="ConfigurationStorage" value="UseDevelopmentStorage=true" />
      <Setting name="ConfigurationContainer" value="external-configurations" />
      <Setting name="ConfigurationVersion" value="1" />
      <Setting name="Deployment" value="Local" />
    </ConfigurationSettings>
  </Role>
</ServiceConfiguration>

```

These are basically all of the settings I need to keep in my .cscfg files. As I decided to store my external configuration in XML files I need a connection string to a storage account and a container name. Configuration version plays a key part here as it binds my service to a particular configuration set. I also need to add an explicit setting identifying current deployment (Local, Cloud, etc) as there is no way to get it at runtime and I use the deployment name as part of persistence path (more on that later). Now, that ‘Diagnostics.ConnectionString’ setting is not technically needed to implement the pattern however we often initialize logging at the very early stage of a service lifetime as we want to capture messages from our external configuration infrastructure components even if it can’t be properly initialized.

## Uploading external configuration

Now that configuration has been isolated it won’t be deployed together with our services. We can upload the external configuration files to blob containers manually but this is an error prone tedious task that won’t get us far. Remember on Azure to [automate everything](https://alexandrebrisebois.wordpress.com/2014/07/31/automate-everything/)! In the sample solution you can find [Upload-Configuration.ps1](https://bitbucket.org/dzimchuk/azuresettingsupdatesample/src/c1a48f21c5f872dcb677737dd7f9ecef86831d92/Automation/Upload-Configuration.ps1?at=master) PowerShell script in Automation folder that accepts a deployment name (Local, Cloud, etc) and takes care of the rest. It will pull the metadata configuration from the appropriate .cscfg file, insure that the target container exists and upload an external configuration file that corresponds to the specified deployment option.

I won’t post it here due its length but you may really want to spend some time studying it.

.\Upload-Configuration.ps1 -deployment Cloud

[![Running Upload-Configuration.ps1](https://blogcontent.azureedge.net/image_thumb_6.png "Running Upload-Configuration.ps1")](https://blogcontent.azureedge.net/image_6.png)

Because we have just uploaded the configuration for the first time it has been assigned version 1 as you can tell from the blob name (Cloud/01.xml). It also uses the deployment option as part of the path. Again, this is just an example. You may choose a more sophisticated naming scheme. On one project where we successfully implement the pattern we include date in the blob path for easier search and use an accompanying table storage index table for quick access programmatically.

## Accessing external configuration

As we moved our application settings to an external location we can’t rely on `CloudConfigurationManager` anymore. Instead, we need a similar component that can look close to this:

```
public class SettingsCache
{
    private static readonly Lazy<SettingsCache> instance = 
        new Lazy<SettingsCache>();

    public static SettingsCache Insance
    {
        get { return instance.Value; }
    }

    private readonly ConcurrentDictionary<string, string> cache = 
        new ConcurrentDictionary<string, string>();

    public string Find(string key)
    {
        string value;
        return cache.TryGetValue(key, out value) ? value : null;
    }

    public void Update()
    {
        var content = DownloadConfigurationFile();
        var settings = Parse(content);

        foreach (var pair in settings)
        {
            cache.AddOrUpdate(pair.Key, pair.Value, (k, v) => pair.Value);
        }

        TestEventSource.Log.LogSettingsCacheUpdate();
    }

    private static string DownloadConfigurationFile()
    {
        var storageAccount = 
            CloudStorageAccount.Parse(CloudConfigurationManager.GetSetting("ConfigurationStorage"));
        var containerName = 
            CloudConfigurationManager.GetSetting("ConfigurationContainer");

        var client = storageAccount.CreateCloudBlobClient();
        var container = client.GetContainerReference(containerName);

        var blobName = GetConfigurationBlobName();
        var blob = container.GetBlockBlobReference(blobName);

        return blob.DownloadText();
    }

    private static string GetConfigurationBlobName()
    {
        var deployment = 
            CloudConfigurationManager.GetSetting("Deployment");
        var version = int.Parse(CloudConfigurationManager.GetSetting("ConfigurationVersion"));

        return string.Format("{0}/{1:D2}.xml", deployment, version);
    }

    private static Dictionary<string, string> Parse(string content)
    {
        var doc = XDocument.Parse(StripBom(content));
        var settings = (from s in doc.Descendants("Setting")
                        select new
                        {
                            Key = s.Attribute("name").Value,
                            Value = s.Attribute("value").Value
                        }).ToList();

        return settings.ToDictionary(s => s.Key, s => s.Value);
    }

    private static string StripBom(string content)
    {
        var index = content.IndexOf("<", StringComparison.Ordinal);
        return index > 0 ? content.Substring(index) : content;
    }
}

```

I have posted the whole class so you can see how all of the metadata settings I was talking about are used by consuming applications. I am not saying it’s production ready like, for example, there is no error handling logic and interaction with Azure storage should be a separate component on its own but still it is a good place to start. Our `SettingsCache` class provides public `Find` (similar to `CloudConfigurationManager.GetSetting`) and `Update` methods methods. The latter is our way to reload external configuration when needed.

When do we need to reload settings? Apparently at start-up. Remember, however, that web roles code is executed in [two processes](post/Be-aware-of-Web-role-host-process) and we need to initialize `SettingsCache` in both. However, we also want to enable our running services to refresh their settings cache without requiring a restart.

## Responding to a configuration change

When we upload a new configuration set we need to make services aware of that by updating configuration version in their, well, native configuration. We can do that right on the Configure tab on the portal or we can do that from the command line ([cross-platform tools](http://azure.microsoft.com/en-us/documentation/articles/xplat-cli/) or [PowerShell](http://azure.microsoft.com/en-us/documentation/articles/install-configure-powershell/)). Regardless of the way we update the ConfigurationVersion value we need to make services respond to that by loading an appropriate version of the external configuration set.

Azure cloud services provide us with `RoleEnvironment.Changed` event that notifies us when a setting (or settings) have been changed for a running service. We can inspect what settings have been changed and perform appropriate actions.

```
RoleEnvironment.Changed += (sender, args) =>
{
    var configurationChanges = args.Changes
                               .OfType<RoleEnvironmentConfigurationSettingChange>()
                               .ToList();
    if (configurationChanges.Any(c => c.ConfigurationSettingName == "ConfigurationVersion"))
        SettingsCache.Insance.Update();

    TestEventSource.Log.LogTestSetting(SettingsCache.Insance.Find("TestSetting"));
};

```

Once again, remember that you want to handle the event in the process that actually stores the cache. In the sample solution I handle the event in IIS process by subscribing to the event in OWIN start-up class.

When we deploy our application to Azure and open up a web link we can see that it shows initial value:

[![Initial value](https://blogcontent.azureedge.net/image_thumb_7.png "Initial value")](https://blogcontent.azureedge.net/image_7.png)

Let’s change ‘TestSetting’ value in the external configuration file to ‘updated value’ and upload it. The PowerShell script will assign version 2 this time (Cloud/02.xml). Then let’s go to the portal and enter ‘2’ for ConfigurationVersion on both web and worker roles. After we hit ‘Save’ our roles are going under transitioning that we can notice on the Instances tab:

[![The deployment is transitioning](https://blogcontent.azureedge.net/image_thumb_8.png "The deployment is transitioning")](https://blogcontent.azureedge.net/image_8.png)

While the roles are in the transitioning state they are still responsive. If we keep hitting refresh on the browser it will keep returning the initial value and at some point it will start returning the ‘updated value’.