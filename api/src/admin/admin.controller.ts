import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
export class AdminController {
    constructor(private prisma: PrismaService) { }

    @Get('stats')
    async getStats() {
        //total counts as an optimized single query using Promise.all
        const [
            totalUsers,
            totalEvents,
            totalPhotos,
            facesDetected,
            activeEvents,
            eventsByStatus,
            photosByStatus,
            usersByRole
        ] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.event.count(),
            this.prisma.photo.count(),
            this.prisma.face.count(),
            this.prisma.event.count({ where: { status: 'PUBLISHED' } }),

            // Events breakdown - Draft, Published, Archived
            this.prisma.event.groupBy({
                by: ['status'],
                _count: true
            }),

            // Photos breakdown - Pending, Processing, Completed, Failed
            this.prisma.photo.groupBy({
                by: ['processingStatus'],
                _count: true
            }),
            // Users breakdown - roles of students, photographers, admins
            this.prisma.user.groupBy({
                by: ['role'],
                _count: true
            })
        ]);

        return {
            totalUsers,
            totalEvents,
            totalPhotos,
            facesDetected,
            activeEvents,
            //each breakdown mapped to a cleaner format as arrays of objects
            //eg: eventsByStatus: [ { status: 'DRAFT', count: 10 }, { status: 'PUBLISHED', count: 5 } ]
            eventsByStatus: eventsByStatus.map(e => ({ status: e.status, count: e._count })),
            photosByStatus: photosByStatus.map(p => ({ status: p.processingStatus, count: p._count })),
            usersByRole: usersByRole.map(u => ({ role: u.role, count: u._count }))
        };
    }
}
