import {
    Controller,
    Post,
    Get,
    Delete,
    Put,
    Param,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Request,
    Headers,
    UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SearchReferencePhotosService } from './search-reference-photos.service';

/**
 * Controller for managing user's search reference photos
 * 
 * Note: This controller assumes you have authentication guards in place.
 * The @Request() decorator should provide req.user.id for the authenticated user.
 * You may need to add @UseGuards(JwtAuthGuard) or similar based on your auth setup.
 */
@Controller('search-reference-photos')
export class SearchReferencePhotosController {
    constructor(private readonly searchReferencePhotosService: SearchReferencePhotosService,) { }

    private resolveUserId(headerUserId: string | undefined, req: any) {
        const userId = headerUserId || req?.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User ID required');
        }
        return userId;
    }

    /**
     * Upload a new search reference photo
     */
    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadSearchPhoto(
        @UploadedFile() file: Express.Multer.File,
        @Headers('user-id') headerUserId: string,
        @Request() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('File is required');
        }
        if (!file.mimetype.startsWith('image/')) {
            throw new BadRequestException('Only image files are allowed');
        }
        const userId = this.resolveUserId(headerUserId, req);
        return await this.searchReferencePhotosService.uploadSearchPhoto(file, userId);
    }

    /**
     * Get all search reference photos for the authenticated user
     */
    @Get()
    async getUserSearchPhotos(
        @Headers('user-id') headerUserId: string,
        @Request() req: any,
    ) {
        const userId = this.resolveUserId(headerUserId, req);
        return await this.searchReferencePhotosService.getUserSearchPhotos(userId);
    }

    /**
     * Get a specific search reference photo by ID
     */
    @Get(':id')
    async getSearchPhotoById(
        @Param('id') id: string,
        @Headers('user-id') headerUserId: string,
        @Request() req: any,
    ) {
        const userId = this.resolveUserId(headerUserId, req);
        return await this.searchReferencePhotosService.getSearchPhotoById(id, userId);
    }

    /**
     * Delete a search reference photo
     */
    @Delete(':id')
    async deleteSearchPhoto(
        @Param('id') id: string,
        @Headers('user-id') headerUserId: string,
        @Request() req: any,
    ) {
        const userId = this.resolveUserId(headerUserId, req);
        return await this.searchReferencePhotosService.deleteSearchPhoto(id, userId);
    }

    /**
     * Replace an existing search reference photo with a new one
     */
    @Put(':id')
    @UseInterceptors(FileInterceptor('file'))
    async replaceSearchPhoto(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Headers('user-id') headerUserId: string,
        @Request() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('File is required');
        }
        if (!file.mimetype.startsWith('image/')) {
            throw new BadRequestException('Only image files are allowed');
        }
        const userId = this.resolveUserId(headerUserId, req);
        return await this.searchReferencePhotosService.replaceSearchPhoto(id, file, userId);
    }
}
