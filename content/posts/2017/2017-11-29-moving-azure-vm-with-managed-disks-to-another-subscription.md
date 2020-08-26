---
title: Moving Azure VM with managed disks to another subscription
date: 2017-11-29 21:00:30
permalink: moving-azure-vm-with-managed-disks-to-another-subscription
excerpt: The problem is that it's not currently supported. The only way around this is to export your managed disks and recreate your VM. If you just use managed data disks (and the OS one is unmanaged) then you don't have to recreate the VM. But in both cases you're going to experience some downtime...
uuid: 756f2b59-d611-49a2-a0e3-cff24fb2eb52
tags: Azure Virtual Machines, Azure PowerShell
---

The problem is that it's not currently supported. Well, at least at the time of writing. The only way around this is to export your managed disks, that is, store them as regular page blobs and recreate your VM.

**Update**: As of September 24, 2018 it is possible to move VMs with managed disks to other resource groups and/or subscriptions. Just make sure to register the feature as explained [here](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-move-resources#virtual-machines-limitations).

If you just use managed data disks (and the OS one is unmanaged) then you don't have to recreate the VM. But in both cases you're going to experience some downtime because you can't export a managed disk that is currently attached (that is the VM that's using it is running). The disk has to be either unattached or in the reserved state. The reserved state is when your VM is deprovisioned.

And it's unfortunate because the export process is not fast. It's pretty far from being fast in fact. With a regular 128Gb disk it may take about 2 hours to complete (although it looks like the blob copying operation is pretty effiecient and it only spends time when copying the actual data within a preallocated blob). So you should really consider if it's worth redeploying your workload on a newly provisioned VM instead of moving the existing one. Also make sure you have redundant deployments for workloads that can't tolerate downtime.

But there are cases when the redeploy requires much more effort. This post is to provide you with fairly automated steps to perform the move. The good news is that it's the actual export process and creation of the new VM that require downtime. You can move a running VM to another subscription while it's running and serving requests.

Alright, so we're dealing with a 3 step process:

- exporting managed disks
- recreating the VM
- actually moving the new VM and all the related resources (including the storage account with exported disks) to a new subscription

You can optimize this process by moving the storage account while the old VM (that is still using managed disks) is running and creating a new VM directly in the new subscription.

To simplify things I'm going to follow the outlined process in this post and assume you just have a single OS disk and no data disks in code samples.

## Exporting a managed disk

You can copy a managed disk to a storage account by first requesting a temporary URI to the disk with a SAS token:

```
$grant = Grant-AzureRmDiskAccess -ResourceGroupName $ResourceGroupName -DiskName $DiskName -Access Read -DurationInSecond 10800
```

Here I used 3 hours as the duration of the token, you may want to adjust depending on the size of your disk. The URI is going to be available through the `grant.AccessSAS` property.

Then you initiate the copy operation with `Start-AzureStorageBlobCopy`:

```
$storageAccountKey = Get-AzureRmStorageAccountKey -ResourceGroupName $StorageAccountResourceGroupName -Name $StorageAccountName
$storageContext = New-AzureStorageContext -StorageAccountName $StorageAccountName -StorageAccountKey $storageAccountKey.Value[0]

$containerName = "vhds"
$container = Get-AzureStorageContainer $containerName -Context $storageContext -ErrorAction Ignore
if ($container -eq $null)
{
    New-AzureStorageContainer $containerName -Context $storageContext
}

$vhd = $DiskName + '.vhd'
$blob = Start-AzureStorageBlobCopy -AbsoluteUri $grant.AccessSAS -DestContainer $containerName -DestBlob $vhd -DestContext $storageContext
```

You can request the status of the copy operation with the `Get-AzureStorageBlobCopyState` cmdlet. You basically need to wait until it's finished:

```
$status = $blob | Get-AzureStorageBlobCopyState
$status
                                   
While($status.Status -eq "Pending"){
  Start-Sleep 30
  $status = $blob | Get-AzureStorageBlobCopyState
  $status
}
```

## Recreating a VM

Like I've mentioned you may want to create the new VM directly in the destination subscription while the old VM is running. You will minimize downtime and be able to test the new deployment before killing the old VM. You will also need to prepare the required resources (network, NSG, IP address(es), etc) in the new subscription before creating the VM.

But in this post we're going to keep things simple and recreate the VM in the original resource group of the original subscription. I can't say it's a recommended way as you're going to have to drop the original VM first and then re-assign its NIC(s) to the new one and there is always a chance that something goes wrong in between.

```
# Get the storage account where you've exported the disk to
$storageAccount = Get-AzureRmStorageAccount `
    -ResourceGroupName $storageAccountResourceGroupName `
    -Name $storageAccountName

$blobEndpoint = $storageAccount.PrimaryEndpoints.Blob.ToString()
$osDiskUri = $blobEndpoint + "vhds/" + $osDiskName  + ".vhd"

# Get the existing VM
$originalVm = Get-AzureRmVM -ResourceGroupName $resourceGroupName -Name $vmName

# Point of no return (well, sort of)
Remove-AzureRmVM -ResourceGroupName $resourceGroupName -Name $vmName

# Create a new VM with the same name and size
$newVm = New-AzureRmVMConfig -VMName $originalVm.Name -VMSize $originalVm.HardwareProfile.VmSize

Set-AzureRmVMOSDisk `
    -VM $newVm `
    -Name $osDiskName `
    -VhdUri $osDiskUri `
    -Caching ReadWrite `
    -CreateOption Attach `
    -Windows

foreach($nic in $originalVm.NetworkProfile.NetworkInterfaces)
{
    Add-AzureRmVMNetworkInterface -VM $newVm -Id $nic.Id
}

New-AzureRmVM -ResourceGroupName $resourceGroupName -Location $location -VM $newVm
```

The key point here is to attach (`-CreateOption Attach`) the exported disk with the `Set-AzureRmVMOSDisk` cmdlet to the new VM. You should also specify if it's `-Windows` or `-Linux`, I guess it's a pure Azure setting that may be required for internal placement decision but you never know.

And of course you need to add the VM to the existing network by adding the old one's NIC(s) to it.

## Moving VM to another subscription

You want to make sure to move all related resources with it. Realistacally your network is going to be in another resource group as it has a different lifetime then your VMs. The same may be true for storage accounts. But in this post we assume a simple case when you have a VM created from the portal and all resources are in the same group.

```
if ((Get-AzureRmSubscription -SubscriptionId $subscriptionId).TenantId -ne (Get-AzureRmSubscription -SubscriptionId $destinationSubscriptionId).TenantId)
{
    throw "Source and destination subscriptions are not associated with the same tenant"
}

Set-AzureRmContext -Subscription $destinationSubscriptionId

#Register-AzureRmResourceProvider -ProviderNamespace Microsoft.Compute
#Register-AzureRmResourceProvider -ProviderNamespace Microsoft.Network
#Register-AzureRmResourceProvider -ProviderNamespace Microsoft.Storage

$rg = Get-AzureRmResourceGroup -Name $destinationResourceGroupName -Location $destinationLocation -ErrorAction Ignore
if (-Not $rg)
{
    $rg = New-AzureRmResourceGroup -Name $destinationResourceGroupName -Location $destinationLocation
}

Set-AzureRmContext -Subscription $subscriptionId

$resources = Get-AzureRmResource -ResourceId "/subscriptions/$subscriptionId/resourceGroups/$resourceGroupName/resources" `
    | ? { $_.ResourceType -ne 'Microsoft.Compute/virtualMachines/extensions' } `
    | select -ExpandProperty ResourceId
    
Move-AzureRmResource -DestinationSubscriptionId $destinationSubscriptionId -DestinationResourceGroupName $destinationResourceGroupName -ResourceId $resources
```

There are some preconditions that you need to check. Both subscriptions have to be associated with the same Azure AD tenant and there have to be required resource providers registered in the destination subscription. At the very least you will need `Microsoft.Compute`, `Microsoft.Network` and `Microsoft.Storage` which may be already registered if you have some other resources of the corresponding types in the subscription.

Notice that you should also exclude VM extensions as they are not top level resources and are going to be moved together with the VM. And of course you want to make sure you have deleted the old managed disk before running this script.