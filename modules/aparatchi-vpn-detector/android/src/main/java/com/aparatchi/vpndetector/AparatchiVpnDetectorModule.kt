package com.aparatchi.vpndetector

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AparatchiVpnDetectorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AparatchiVpnDetector")

    AsyncFunction("isVpnActive") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return@AsyncFunction false

      val activeCapabilities = connectivityManager.activeNetwork?.let {
        connectivityManager.getNetworkCapabilities(it)
      }
      if (activeCapabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true) {
        return@AsyncFunction true
      }

      return@AsyncFunction connectivityManager.allNetworks.any { network ->
        connectivityManager.getNetworkCapabilities(network)
          ?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
      }
    }
  }
}
