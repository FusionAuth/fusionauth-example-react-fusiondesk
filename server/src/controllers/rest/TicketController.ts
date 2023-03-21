import {Controller, Inject} from '@tsed/di';
import {Get, Integer, Patch, Post} from '@tsed/schema';
import {BodyParams, Locals, PathParams} from '@tsed/platform-params';
import {TICKET_REPOSITORY} from '../../datasources/TicketRepository';
import {TicketEntity, TicketStatus} from '../../datasources/Ticket.entity';
import {FusionAuthClient} from '@fusionauth/typescript-client';
import {DeepPartial} from 'typeorm/common/DeepPartial';
import {FindOptionsWhere} from 'typeorm/find-options/FindOptionsWhere';
import {Constant} from '@tsed/cli-core';

/**
 * Ticket controller
 *
 * Allows users to create tickets and agents to manage them
 */
@Controller('/tickets')
export class TicketController {

    @Constant('envs.FUSIONAUTH_API_KEY')
    private apiKey: string;

    @Constant('envs.FUSIONAUTH_SERVER_URL')
    private baseUrl: string;

    @Inject(TICKET_REPOSITORY)
    private ticketRepository: TICKET_REPOSITORY;

    constructor() {
    }

    /**
     * Get all tickets
     * @param locals
     */
    @Get('/')
    async findAll(@Locals() locals: { user: any }): Promise<(Partial<TicketEntity> & { _creator: any }) []> {
        const where: FindOptionsWhere<TicketEntity> = {};
        if (!locals.user?.roles?.includes('agent')) {
            where['creator'] = locals.user.sub;
        }

        // Get all tickets
        const tickets = await this.ticketRepository.find({where, order: {id: 'DESC'}});

        // Retrieve uses from FusionAuth
        const creators = new Map<string, any>();
        const client = new FusionAuthClient(this.apiKey, this.baseUrl);

        for await (const ticket of tickets) {
            if (!creators.has(ticket.creator)) {
                const user = await client.retrieveUser(ticket.creator);
                creators.set(ticket.creator, user.response.user);
            }
        }

        // Return tickets with creator data embedded
        return tickets
            .map(ticket => {
                return {
                    id: ticket.id,
                    title: ticket.title,
                    creator: ticket.creator,
                    status: ticket.status,
                    created: ticket.created,
                    updated: ticket.updated,
                    _creator: creators.get(ticket.creator)
                };
            });
    }

    /**
     * Get a single ticket
     * @param id
     */
    @Get('/:id')
    find(@PathParams("id") @Integer() id: number): Promise<TicketEntity> {
        return this.ticketRepository.findOneByOrFail({id});
    }

    /**
     * Create a new ticket
     * @param ticket
     * @param locals
     */
    @Post('/')
    create(@BodyParams() ticket: DeepPartial<TicketEntity>, @Locals() locals: { user: any }): Promise<TicketEntity> {
        const ticketEntity = this.ticketRepository.create();
        this.ticketRepository.merge(ticketEntity, {
            title: ticket.title,
            description: ticket.description,
        });
        ticketEntity.creator = locals.user.sub;
        return this.ticketRepository.save(ticketEntity);
    }

    /**
     * Update a ticket
     * @param id
     * @param ticketInput
     * @param locals
     */
    @Patch('/:id')
    async update(@PathParams("id") @Integer() id: number, @BodyParams() ticketInput: DeepPartial<TicketEntity>, @Locals() locals: { user: any }): Promise<TicketEntity> {
        let filteredTicketInput: DeepPartial<TicketEntity> = {
            title: ticketInput.title,
            description: ticketInput.description,
            status: ticketInput.status,
        };
        if (locals.user.roles.includes('agent')) {
            filteredTicketInput = {
                ...filteredTicketInput,
                solution: ticketInput.solution,
            };
        } else if (ticketInput.status !== TicketStatus.OPEN && ticketInput.status !== TicketStatus.CLOSED)
            throw new Error('You are not allowed to change the status of the ticket');

        const ticket = await this.ticketRepository.findOneByOrFail({id});
        this.ticketRepository.merge(ticket, filteredTicketInput);
        return this.ticketRepository.save(ticket);
    }
}
