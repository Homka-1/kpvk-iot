import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service.js';
import { AssignmentTypesCatalogSync } from './assignment-types-catalog.js';
import { LibraryAssignmentsService } from './assignments.service.js';
import { FilesService } from './files.service.js';
import {
  AssignmentTypesController,
  FilesController,
  LibraryAssignmentsController,
  MaterialsController,
} from './library.controller.js';
import { MaterialsService } from './materials.service.js';

@Module({
  controllers: [
    FilesController,
    MaterialsController,
    AssignmentTypesController,
    LibraryAssignmentsController,
  ],
  providers: [
    AssignmentTypesCatalogSync,
    FilesService,
    MaterialsService,
    LibraryAssignmentsService,
    IdempotencyService,
  ],
  exports: [FilesService],
})
export class LibraryModule {}
