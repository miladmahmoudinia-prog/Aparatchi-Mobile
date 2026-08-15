package expo.modules.aparatchicustomtab

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsService
import androidx.browser.customtabs.CustomTabsServiceConnection
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AparatchiCustomTabModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AparatchiCustomTab")

    AsyncFunction("openAsync") { url: String, promise: Promise ->
      val activity = appContext.currentActivity
      val context = appContext.reactContext
      if (activity == null || context == null) {
        promise.reject("NO_ACTIVITY", "Aparatchi activity is not available.", null)
        return@AsyncFunction
      }

      val uri = runCatching { Uri.parse(url) }.getOrNull()
      if (uri == null || (uri.scheme != "http" && uri.scheme != "https")) {
        promise.reject("INVALID_URL", "Only HTTP(S) operator URLs can be opened.", null)
        return@AsyncFunction
      }

      activity.runOnUiThread {
        try {
          val packageManager = context.packageManager
          val customTabPackages = packageManager
            .queryIntentServices(
              Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION),
              PackageManager.MATCH_ALL,
            )
            .mapNotNull { it.serviceInfo?.packageName }
            .distinct()

          val defaultBrowserPackage = packageManager.resolveActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com")),
            PackageManager.MATCH_DEFAULT_ONLY,
          )?.activityInfo?.packageName
            ?.takeUnless { it == "android" }

          val preferredPackages = (
            listOfNotNull(
              defaultBrowserPackage,
              "com.android.chrome",
              "com.google.android.apps.chrome",
              "org.chromium.chrome",
            ) + customTabPackages
          ).distinct()

          val browserPackage = CustomTabsClient.getPackageName(
            context,
            preferredPackages,
            false,
          )
          if (browserPackage == null) {
            promise.reject("NO_CUSTOM_TAB", "No Custom Tabs capable browser is installed.", null)
            return@runOnUiThread
          }

          var settled = false
          var bound = false
          lateinit var connection: CustomTabsServiceConnection

          fun unbindQuietly() {
            if (!bound) return
            bound = false
            runCatching { context.unbindService(connection) }
          }

          fun rejectOnce(code: String, message: String, error: Throwable? = null) {
            if (settled) return
            settled = true
            unbindQuietly()
            promise.reject(code, message, error)
          }

          connection = object : CustomTabsServiceConnection() {
            override fun onCustomTabsServiceConnected(
              name: ComponentName,
              client: CustomTabsClient,
            ) {
              activity.runOnUiThread {
                if (settled) return@runOnUiThread
                try {
                  client.warmup(0L)
                  val session = client.newSession(null)
                    ?: throw IllegalStateException("Could not create Custom Tabs session.")

                  val customTabsIntent = CustomTabsIntent.Builder()
                    .setSession(session)
                    .setShowTitle(false)
                    .setUrlBarHidingEnabled(true)
                    .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
                    .setSendToExternalDefaultHandlerEnabled(false)
                    .build()

                  // Keep a real browser-backed Custom Tab so Upera receives a
                  // normal browser context, but pin the launch to one concrete
                  // browser activity as well as its package. Some Android builds
                  // (Dual Apps / cloned Chrome / cross-profile resolvers) still
                  // show an "Open with" chooser when only setPackage() is used.
                  val launchIntent = customTabsIntent.intent.apply {
                    data = uri
                    setPackage(browserPackage)
                  }
                  val browserActivity = packageManager
                    .queryIntentActivities(launchIntent, PackageManager.MATCH_DEFAULT_ONLY)
                    .mapNotNull { it.activityInfo }
                    .firstOrNull { it.packageName == browserPackage }
                    ?: throw IllegalStateException(
                      "No browser activity found for the selected Custom Tabs package.",
                    )

                  launchIntent.component = ComponentName(
                    browserActivity.packageName,
                    browserActivity.name,
                  )
                  customTabsIntent.launchUrl(activity, uri)

                  settled = true
                  unbindQuietly()
                  promise.resolve(
                    mapOf(
                      "opened" to true,
                      "browserPackage" to browserPackage,
                      "browserActivity" to browserActivity.name,
                      "explicitComponent" to true,
                      "sessionBound" to true,
                    ),
                  )
                } catch (error: Throwable) {
                  rejectOnce(
                    "CUSTOM_TAB_OPEN_FAILED",
                    error.message ?: "Could not open Custom Tab.",
                    error,
                  )
                }
              }
            }

            override fun onServiceDisconnected(name: ComponentName) {
              activity.runOnUiThread {
                if (!settled) {
                  rejectOnce(
                    "CUSTOM_TAB_DISCONNECTED",
                    "Custom Tabs browser disconnected before playback opened.",
                  )
                }
              }
            }
          }

          bound = CustomTabsClient.bindCustomTabsServicePreservePriority(
            context,
            browserPackage,
            connection,
          )
          if (!bound) {
            rejectOnce(
              "CUSTOM_TAB_BIND_FAILED",
              "Could not bind to the selected Custom Tabs browser.",
            )
          }
        } catch (error: Throwable) {
          promise.reject(
            "CUSTOM_TAB_OPEN_FAILED",
            error.message ?: "Could not open Custom Tab.",
            error,
          )
        }
      }
    }
  }
}
