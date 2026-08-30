package com.stoya.tavernrev

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.content.ClipData
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

class TavernApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }

    @androidx.annotation.Keep
    fun installApk(filePath: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                val file = File(filePath)
                if (!file.exists()) {
                    Toast.makeText(this, "APK file not found on disk: $filePath", Toast.LENGTH_LONG).show()
                    return@post
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!packageManager.canRequestPackageInstalls()) {
                        Toast.makeText(this, "Please allow installation from this source", Toast.LENGTH_LONG).show()
                        val manageIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                            data = Uri.parse("package:$packageName")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(manageIntent)
                        return@post
                    }
                }
                
                val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    clipData = ClipData.newRawUri("", uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }

                val resInfoList = packageManager.queryIntentActivities(intent, 0)
                for (resolveInfo in resInfoList) {
                    val pkgName = resolveInfo.activityInfo.packageName
                    grantUriPermission(pkgName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

                startActivity(intent)
            } catch (e: Throwable) {
                e.printStackTrace()
                Toast.makeText(this, "Install failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
