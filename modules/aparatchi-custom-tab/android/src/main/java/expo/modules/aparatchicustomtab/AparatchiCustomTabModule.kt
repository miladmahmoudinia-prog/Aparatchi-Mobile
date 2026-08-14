package expo.modules.aparatchicustomtab

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsService
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
          val serviceIntent = Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION)
          val customTabPackages = packageManager
            .queryIntentServices(serviceIntent, PackageManager.MATCH_ALL)
            .mapNotNull { it.serviceInfo?.packageName }
            .distinct()

          val defaultBrowserPackage = packageManager.resolveActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com")),
            PackageManager.MATCH_DEFAULT_ONLY,
          )?.activityInfo?.packageName
            ?.takeUnless { it == "android" }

          val preferredPackages = listOfNotNull(
            defaultBrowserPackage,
            "com.android.chrome",
            "com.google.android.apps.chrome",
            "org.chromium.chrome",
          ) + customTabPackages

          val browserPackage = preferredPackages.firstOrNull { it in customTabPackages }
          if (browserPackage == null) {
            promise.reject("NO_CUSTOM_TAB", "No Custom Tabs capable browser is installed.", null)
            return@runOnUiThread
          }

          val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(false)
            .setUrlBarHidingEnabled(true)
            .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            .build()

          customTabsIntent.intent.data = uri
          customTabsIntent.intent.setPackage(browserPackage)

          // Some Android skins expose the same browser twice (for example a cloned
          // Chrome profile) and can still surface the Resolver even when a package
          // is supplied. Resolve the concrete activity inside that package and pin
          // the Custom Tab intent to that exact component.
          val resolved = packageManager.resolveActivity(
            customTabsIntent.intent,
            PackageManager.MATCH_DEFAULT_ONLY,
          )
          val activityInfo = resolved?.activityInfo
          if (activityInfo != null && activityInfo.packageName == browserPackage) {
            customTabsIntent.intent.component = ComponentName(activityInfo.packageName, activityInfo.name)
          } else {
            val concrete = packageManager
              .queryIntentActivities(customTabsIntent.intent, PackageManager.MATCH_DEFAULT_ONLY)
              .firstOrNull { it.activityInfo?.packageName == browserPackage }
              ?.activityInfo
            if (concrete != null) {
              customTabsIntent.intent.component = ComponentName(concrete.packageName, concrete.name)
            }
          }

          customTabsIntent.launchUrl(activity, uri)
          promise.resolve(
            mapOf(
              "opened" to true,
              "browserPackage" to browserPackage,
              "explicitComponent" to (customTabsIntent.intent.component != null),
            ),
          )
        } catch (error: Throwable) {
          promise.reject("CUSTOM_TAB_OPEN_FAILED", error.message ?: "Could not open Custom Tab.", error)
        }
      }
    }
  }
}
