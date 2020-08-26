---
title: Updating Azure cloud service configuration with PowerShell
date: 2015-03-09 14:48:00
permalink: updating-azure-cloud-service-configuration-with-powershell
excerpt: In this post I want to give you another example of automating DevOps activities. This time we're going update configuration settings of a running Azure cloud service. I am talking about settings we specify in .cscfg files.
uuid: ff32983b-3247-42f8-9639-2278c55c6443
tags: Azure PowerShell, Azure Cloud Services
---

Azure team ships PowerShell cmdlets that allow us to automate literally any task we can perform on the portal. Automating development tasks is important for efficient DevOps flow as it gives us fast and reliable way to perform every day activities setting up environments, deploying applications, collecting diagnostics and so on.

In my previous post I gave an example of where we would want to go with automation. We used a PowerShell script to upload external configuration files for our service. But in fact the script did more than that. It took care of setting up a blob container if one was missing, it figured what version to assign to a newly uploaded configuration. It was smart enough to draw necessary information from .cscfg files so we didn't have to specify that on the command line. It removed a lot of manual work that is error prone and slow.

In this post I want to give you another example of automating DevOps activities. This time we're going update configuration settings of a running Azure cloud service. I am talking about settings we specify in .cscfg files. We can update them on the portal without causing role's restart (if our roles do not require it though) but we can also do that with Set-AzureDeployment cmdlet.

An important thing to note about Set-AzureDeployment is that it updates configuration of the whole service when run with -Config parameter. It requires you to specify an XML file containing service configuration to be uploaded. It can't change a particular setting of a specific role. Basically using it resembles what you do on the portal where you are presented with all of the settings of all roles on a single page. When you hit 'Save' button all settings are applied.

If we need to update a particular setting we first need to get the whole configuration of the service. This can be done with Get-AzureDeployment cmdlet.

Get-AzureDeployment -ServiceName $cloudService -Slot $slot

[![Get-AzureDeployment output](https://blogcontent.azureedge.net/Get-AzureDeployment_thumb.png "Get-AzureDeployment output")](https://blogcontent.azureedge.net/Get-AzureDeployment.png)

Looking at the output we can see that Configuration property contains an XML document that represents our service configuration defined in .cscfg file. Updating a specific setting of a particular role now boils down to updating the XML document and uploading it with Set-AzureDeployment cmdlet.

Let's write a PowerShell script for that!

```
<# 
 .Synopsis
  Updates settings of a live service

 .Parameter cloudService
  Name of a cloud service

 .Parameter slot
  Deployment slot

 .Parameter settingKey
  Key of a setting to be updated

 .Parameter settingValue
  Setting value to be set

 .Example
   # Update TestSetting value in the staging deployment of AzureSettingsUpdateSample service
   Update-Setting.ps1 -cloudService AzureSettingsUpdateSample 
                      -slot Staging 
                      -settingKey TestSetting 
                       -settingValue 'updated value'
#>

param (
    [string] 
    $cloudService = $(throw "-cloudService is required."),

    [string]
    [ValidateSet('Production','Staging')]
    $slot = $(throw "-slot is required."),

    [string] 
    $settingKey = $(throw "-settingKey is required."),

    [string] 
    $settingValue = $(throw "-settingValue is required.")
 )

function UpdateSettingInRoles([xml]$configuration, [string]$setting, [string]$value)
{
    $updated = $false

    $configuration.ServiceConfiguration.Role | % { 
            $settingElement = $_.ConfigurationSettings.Setting | ? { $_.name -eq $setting }
            if ($settingElement -ne $null -and $settingElement.value -ne $value)
            {
                $settingElement.value = $value
                $updated = $true
            }
        }

    return $updated
}

Write-Host "Updating setting $settingKey for $cloudService" -ForegroundColor Green

# get current settings from Azure
$deployment = Get-AzureDeployment -ServiceName $cloudService -Slot $slot -ErrorAction Stop

$configuration = [xml]$deployment.Configuration

# update setting if needed
$updated = UpdateSettingInRoles $configuration $settingKey $settingValue

if (-not($updated))
{
    Write-Host "No settings have been updated as they are either up to date or not found"
    return
}

# save as a temporary file and upload settings to Azure
$filename = $env:temp + "\" + $cloudService + ".cscfg"
$configuration.Save("$filename")

Set-AzureDeployment -Config -ServiceName $cloudService -Configuration "$filename" -Slot $slot

Remove-Item ("$filename")

Write-Host "Done"

```

The script shown above updates a specified setting in all roles where it finds that setting. It can be updated to take role name(s) to filter the roles we want to update.