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

      // Only the current default network is authoritative. allNetworks can keep a
      // disconnected VPN around briefly and would leave the blocking screen stuck.
      val activeNetwork = connectivityManager.activeNetwork ?: return@AsyncFunction false
      val activeCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
        ?: return@AsyncFunction false

      return@AsyncFunction activeCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }
  }
}
