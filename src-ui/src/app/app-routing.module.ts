import { NgModule } from '@angular/core'
import { PreloadAllModules, RouterModule, Routes } from '@angular/router'
import { AppFrameComponent } from './components/app-frame/app-frame.component'
import { DashboardComponent } from './components/dashboard/dashboard.component'
import { DocumentListComponent } from './components/document-list/document-list.component'
import { DirtyDocGuard } from './guards/dirty-doc.guard'
import { DirtyFormGuard } from './guards/dirty-form.guard'
import { DirtySavedViewGuard } from './guards/dirty-saved-view.guard'
import { PermissionsGuard } from './guards/permissions.guard'
import {
  PermissionAction,
  PermissionType,
} from './services/permissions.service'

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'preview/:id',
    loadComponent: () =>
      import('./components/redesign/document-preview-tab/document-preview-tab.component').then(
        (m) => m.DocumentPreviewTabComponent
      ),
    canActivate: [PermissionsGuard],
    data: {
      requiredPermission: {
        action: PermissionAction.View,
        type: PermissionType.Document,
      },
      componentName: 'DocumentPreviewTabComponent',
    },
  },
  {
    path: '',
    component: AppFrameComponent,
    canDeactivate: [DirtyDocGuard],
    children: [
      {
        path: 'dashboard',
        component: DashboardComponent,
        data: {
          componentName: 'DashboardComponent',
        },
      },
      {
        path: 'documents',
        component: DocumentListComponent,
        canDeactivate: [DirtySavedViewGuard],
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.Document,
          },
          componentName: 'DocumentListComponent',
        },
      },
      {
        path: 'view/:id',
        component: DocumentListComponent,
        canDeactivate: [DirtySavedViewGuard],
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.SavedView,
          },
          componentName: 'DocumentListComponent',
        },
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./components/document-detail/document-detail.component').then(
            (m) => m.DocumentDetailComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.Document,
          },
          componentName: 'DocumentDetailComponent',
        },
      },
      {
        path: 'documents/:id/:section',
        loadComponent: () =>
          import('./components/document-detail/document-detail.component').then(
            (m) => m.DocumentDetailComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.Document,
          },
          componentName: 'DocumentDetailComponent',
        },
      },
      {
        path: 'asn/:id',
        loadComponent: () =>
          import('./components/document-asn/document-asn.component').then(
            (m) => m.DocumentAsnComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.Document,
          },
          componentName: 'DocumentAsnComponent',
        },
      },
      {
        path: 'attributes',
        loadComponent: () =>
          import('./components/manage/document-attributes/document-attributes.component').then(
            (m) => m.DocumentAttributesComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermissionAny: [
            { action: PermissionAction.View, type: PermissionType.Tag },
            {
              action: PermissionAction.View,
              type: PermissionType.Correspondent,
            },
            {
              action: PermissionAction.View,
              type: PermissionType.DocumentType,
            },
            { action: PermissionAction.View, type: PermissionType.StoragePath },
            { action: PermissionAction.View, type: PermissionType.CustomField },
          ],
          componentName: 'DocumentAttributesComponent',
        },
      },
      {
        path: 'attributes/:section',
        loadComponent: () =>
          import('./components/manage/document-attributes/document-attributes.component').then(
            (m) => m.DocumentAttributesComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermissionAny: [
            { action: PermissionAction.View, type: PermissionType.Tag },
            {
              action: PermissionAction.View,
              type: PermissionType.Correspondent,
            },
            {
              action: PermissionAction.View,
              type: PermissionType.DocumentType,
            },
            { action: PermissionAction.View, type: PermissionType.StoragePath },
            { action: PermissionAction.View, type: PermissionType.CustomField },
          ],
          componentName: 'DocumentAttributesComponent',
        },
      },
      {
        path: 'documentproperties',
        redirectTo: '/attributes',
        pathMatch: 'full',
      },
      {
        path: 'documentproperties/:section',
        redirectTo: '/attributes/:section',
        pathMatch: 'full',
      },
      {
        path: 'tags',
        redirectTo: '/attributes/tags',
        pathMatch: 'full',
      },
      {
        path: 'correspondents',
        redirectTo: '/attributes/correspondents',
        pathMatch: 'full',
      },
      {
        path: 'documenttypes',
        redirectTo: '/attributes/documenttypes',
        pathMatch: 'full',
      },
      {
        path: 'storagepaths',
        redirectTo: '/attributes/storagepaths',
        pathMatch: 'full',
      },
      {
        path: 'logs',
        loadComponent: () =>
          import('./components/admin/logs/logs.component').then(
            (m) => m.LogsComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requireAdmin: true,
          componentName: 'LogsComponent',
        },
      },
      {
        path: 'trash',
        loadComponent: () =>
          import('./components/admin/trash/trash.component').then(
            (m) => m.TrashComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.Delete,
            type: PermissionType.Document,
          },
          componentName: 'TrashComponent',
        },
      },
      // redirect old paths
      {
        path: 'settings/mail',
        redirectTo: '/mail',
      },
      {
        path: 'settings/usersgroups',
        redirectTo: '/usersgroups',
      },
      {
        path: 'settings/savedviews',
        redirectTo: '/savedviews',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./components/admin/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
        canDeactivate: [DirtyFormGuard],
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.Change,
            type: PermissionType.UISettings,
          },
          componentName: 'SettingsComponent',
        },
      },
      {
        path: 'settings/:section',
        loadComponent: () =>
          import('./components/admin/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
        canDeactivate: [DirtyFormGuard],
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.UISettings,
          },
          componentName: 'SettingsComponent',
        },
      },
      {
        path: 'config',
        loadComponent: () =>
          import('./components/admin/config/config.component').then(
            (m) => m.ConfigComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.Change,
            type: PermissionType.AppConfig,
          },
          componentName: 'ConfigComponent',
        },
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./components/admin/tasks/tasks.component').then(
            (m) => m.TasksComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.PaperlessTask,
          },
          componentName: 'TasksComponent',
        },
      },
      {
        path: 'customfields',
        redirectTo: '/attributes/customfields',
        pathMatch: 'full',
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./components/manage/workflows/workflows.component').then(
            (m) => m.WorkflowsComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.Workflow,
          },
          componentName: 'WorkflowsComponent',
        },
      },
      {
        path: 'mail',
        loadComponent: () =>
          import('./components/manage/mail/mail.component').then(
            (m) => m.MailComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.MailAccount,
          },
          componentName: 'MailComponent',
        },
      },
      {
        path: 'usersgroups',
        loadComponent: () =>
          import('./components/admin/users-groups/users-groups.component').then(
            (m) => m.UsersAndGroupsComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.User,
          },
          componentName: 'UsersAndGroupsComponent',
        },
      },
      {
        path: 'savedviews',
        loadComponent: () =>
          import('./components/manage/saved-views/saved-views.component').then(
            (m) => m.SavedViewsComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermission: {
            action: PermissionAction.View,
            type: PermissionType.SavedView,
          },
          componentName: 'SavedViewsComponent',
        },
      },
      {
        path: 'share-links',
        loadComponent: () =>
          import('./components/manage/share-links/share-links.component').then(
            (m) => m.ShareLinksComponent
          ),
        canActivate: [PermissionsGuard],
        data: {
          requiredPermissionAny: [
            {
              action: PermissionAction.View,
              type: PermissionType.ShareLink,
            },
            {
              action: PermissionAction.View,
              type: PermissionType.ShareLinkBundle,
            },
          ],
          componentName: 'ShareLinksComponent',
        },
      },
    ],
  },

  {
    path: '404',
    loadComponent: () =>
      import('./components/not-found/not-found.component').then(
        (m) => m.NotFoundComponent
      ),
  },
  { path: '**', redirectTo: '/404', pathMatch: 'full' },
]

@NgModule({
  imports: [
    // Lazy route chunks are fetched in the background once the first
    // navigation has completed, so later navigation stays instant.
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
