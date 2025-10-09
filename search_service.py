from sqlalchemy import and_, or_, func
from datetime import datetime

class SearchService:
    def __init__(self, db):
        self.db = db
    
    def advanced_search(self, query_params):
        query = Service.query
        
        # Text search across multiple fields
        search_text = query_params.get('search', '').strip()
        if search_text:
            search_terms = search_text.split()
            search_conditions = []
            
            for term in search_terms:
                term_condition = or_(
                    Service.title.ilike(f'%{term}%'),
                    Service.description.ilike(f'%{term}%'),
                    Service.tags.ilike(f'%{term}%')
                )
                search_conditions.append(term_condition)
            
            if search_conditions:
                query = query.filter(and_(*search_conditions))
        
        # Apply all filters
        if query_params.get('category') and query_params.get('category') != 'all':
            query = query.filter(Service.category_id == int(query_params.get('category')))
        
        if query_params.get('min_price'):
            query = query.filter(Service.price_min >= float(query_params.get('min_price')))
        
        if query_params.get('max_price'):
            query = query.filter(Service.price_max <= float(query_params.get('max_price')))
        
        if query_params.get('city') and query_params.get('city') != 'all':
            query = query.filter(Service.city.ilike(f'%{query_params.get("city")}%'))
        
        if query_params.get('min_rating'):
            query = query.filter(Service.rating >= float(query_params.get('min_rating')))
        
        if query_params.get('service_type') and query_params.get('service_type') != 'all':
            query = query.filter(Service.service_type == query_params.get('service_type'))
        
        if query_params.get('availability') == 'available':
            query = query.filter(Service.availability == True)
        
        if query_params.get('verified_only') == 'true':
            query = query.join(ServiceProvider).filter(ServiceProvider.is_verified == True)
        
        return query
    
    def apply_sorting(self, query, sort_by='relevance'):
        if sort_by == 'price_low':
            return query.order_by(Service.price_min.asc())
        elif sort_by == 'price_high':
            return query.order_by(Service.price_min.desc())
        elif sort_by == 'rating':
            return query.order_by(Service.rating.desc())
        elif sort_by == 'newest':
            return query.order_by(Service.created_at.desc())
        else:  # relevance
            return query.order_by(Service.rating.desc(), Service.review_count.desc())
